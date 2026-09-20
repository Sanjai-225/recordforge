import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixtures } from "./fixtures";
async function screenshots() {
  await mkdir("docs/screenshots", { recursive: true });
}
async function routeParticipant(
  page: Page,
  data: ReturnType<typeof fixtures>["participant"],
) {
  await page.route("**/api/snapshot?scope=participant", (route) =>
    route.fulfill({ json: data }),
  );
}
test("production login page renders with accessible labels on desktop and mobile", async ({
  page,
}) => {
  await page.route("**/api/snapshot?scope=registration", (r) =>
    r.fulfill({ json: { event: { state: "REGISTRATION_OPEN" }, fields: [] } }),
  );
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await screenshots();
  await page.screenshot({
    path: "docs/screenshots/login-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("configurable registration fields render and closed registration is disabled", async ({
  page,
}) => {
  let open = true;
  await page.route("**/api/snapshot?scope=registration", (r) =>
    r.fulfill({
      json: {
        event: { state: open ? "REGISTRATION_OPEN" : "REGISTRATION_CLOSED" },
        fields: [
          {
            key: "college",
            label: "College",
            type: "text",
            required: true,
            options: [],
          },
        ],
      },
    }),
  );
  await page.goto("/register");
  await expect(page.getByLabel("College *")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create participant account" }),
  ).toBeEnabled();
  open = false;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create participant account" }),
  ).toBeDisabled();
});
test("production routes redirect unauthenticated participant and developer requests", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/developer");
  await expect(page).toHaveURL(/\/developer\/login$/);
});
test("production API refuses a cross-origin mutation", async ({ request }) => {
  const response = await request.post("/api/command", {
    headers: { Origin: "https://untrusted.example" },
    data: { type: "confirm" },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe("INVALID_ORIGIN");
});
test("public progress updates only from snapshots and works on a projector viewport", async ({
  page,
}) => {
  const f = fixtures();
  await page.route("**/api/snapshot?scope=progress", (r) =>
    r.fulfill({ json: f.display }),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/display/progress");
  await expect(page.locator(".big-number")).toHaveText("1");
  f.display.metrics.completed = 784;
  await page
    .getByRole("button", { name: "Synchronize authoritative state" })
    .click();
  await expect(page.locator(".big-number")).toHaveText("784");
  await screenshots();
  await page.screenshot({
    path: "docs/screenshots/progress-projector.png",
    fullPage: true,
  });
});
test("public leaderboard renders configured visible columns", async ({
  page,
}) => {
  const f = fixtures();
  f.display.config = f.leaderboard;
  await page.route("**/api/snapshot?scope=leaderboard", (r) =>
    r.fulfill({ json: f.display }),
  );
  await page.goto("/display/leaderboard");
  await expect(
    page.getByRole("cell", { name: "IT3420", exact: true }),
  ).toBeVisible();
  await screenshots();
  await page.screenshot({
    path: "docs/screenshots/leaderboard.png",
    fullPage: true,
  });
});
test("participant creates chatbot and explicitly confirms both milestones without optimistic counts", async ({
  page,
}) => {
  const f = fixtures(),
    data = f.participant;
  await routeParticipant(page, data);
  let release: (() => void) | undefined,
    verifyStarted = false;
  await page.route("**/api/command", async (route) => {
    const body = route.request().postDataJSON();
    if (body.type === "create") {
      data.chatbots.push({
        id: body.id,
        participant_id: data.participant.id,
        sequence: 2,
        title: body.title,
        deployment_url: body.url,
        additional_data: {},
        created_at: new Date().toISOString(),
        deployed_at: null,
        verified_at: null,
        deleted_at: null,
        version: 1,
      });
      data.metrics.submitted++;
    }
    if (body.type === "confirm") {
      const bot = data.chatbots.find((b) => b.id === body.id)!;
      if (body.step === "deploy") {
        bot.deployed_at = new Date().toISOString();
        bot.version = 2;
        data.metrics.deployed++;
      } else {
        verifyStarted = true;
        await new Promise<void>((r) => {
          release = r;
        });
        bot.verified_at = new Date().toISOString();
        bot.version = 3;
        data.metrics.completed++;
      }
    }
    await route.fulfill({ json: { result: { success: true } } });
  });
  await page.goto("http://127.0.0.1:4401/participant");
  await expect(
    page.getByRole("heading", { name: "Let’s build, Demo." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add chatbot", exact: true }).click();
  await page.getByLabel("Chatbot title").fill("CodeCoach AI");
  await page.getByLabel("Deployment URL").fill("https://example.com/codecoach");
  await page.getByRole("button", { name: "Save chatbot", exact: true }).click();
  const card = page
    .locator(".chatbot-card")
    .filter({ hasText: "CodeCoach AI" });
  await card.getByRole("button", { name: "Confirm deployment" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm deployment" }),
  ).toBeDisabled();
  await page.getByLabel("Chatbot Deployed", { exact: true }).check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm deployment" })
    .click();
  await card.getByRole("button", { name: "Verify chatbot" }).click();
  await page
    .getByLabel("Verified — I have checked my deployed chatbot")
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm verification" })
    .click();
  await expect.poll(() => verifyStarted).toBe(true);
  await expect(page.locator(".completion-number")).toHaveText("1 / 10");
  await expect(
    page.getByRole("button", { name: "Confirming…" }),
  ).toBeDisabled();
  release?.();
  await expect(page.locator(".completion-number")).toHaveText("2 / 10");
  await expect(card.getByText("Counted toward the event")).toBeVisible();
  await screenshots();
  await page.screenshot({
    path: "docs/screenshots/participant-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/participant-mobile.png",
    fullPage: true,
  });
});
test("lost verification response reconciles a committed milestone", async ({
  page,
}) => {
  const f = fixtures();
  f.participant.chatbots[0].verified_at = null;
  f.participant.chatbots[0].version = 2;
  f.participant.metrics.completed = 0;
  await routeParticipant(page, f.participant);
  await page.route("**/api/command", async (r) => {
    f.participant.chatbots[0].verified_at = new Date().toISOString();
    f.participant.metrics.completed = 1;
    await r.abort("failed");
  });
  await page.goto("http://127.0.0.1:4401/participant");
  await page.getByRole("button", { name: "Verify chatbot" }).click();
  await page
    .getByLabel("Verified — I have checked my deployed chatbot")
    .check();
  await page
    .getByRole("button", { name: "Confirm verification", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(page.locator(".completion-number")).toHaveText("1 / 10");
});
test("second tab reconciles after reconnect event", async ({ context }) => {
  const data = fixtures().participant,
    one = await context.newPage(),
    two = await context.newPage();
  await routeParticipant(one, data);
  await routeParticipant(two, data);
  await one.goto("http://127.0.0.1:4401/participant");
  await two.goto("http://127.0.0.1:4401/participant");
  await expect(two.locator(".completion-number")).toHaveText("1 / 10");
  data.metrics.completed = 2;
  await two.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(two.locator(".completion-number")).toHaveText("2 / 10");
});
test("developer overview and reset require typed phrase plus final confirmation", async ({
  page,
}) => {
  const f = fixtures();
  f.developer.event.state = "ENDED";
  f.developer.event.clock.state = "ENDED";
  await page.route("**/api/snapshot?*", (r) =>
    r.fulfill({ json: f.developer }),
  );
  let requests = 0;
  await page.route("**/api/command", (r) => {
    requests++;
    return r.fulfill({ json: { result: { success: true } } });
  });
  await page.goto("http://127.0.0.1:4401/developer");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await screenshots();
  await page.screenshot({
    path: "docs/screenshots/developer-overview.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:4401/developer?section=reset");
  await page
    .getByRole("button", { name: "PREPARE CLEAN EVENT", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review reset" }),
  ).toBeDisabled();
  await page.getByLabel("Reason for this action").fill("Testing is finished");
  await page.getByLabel("Type PREPARE CLEAN EVENT").fill("PREPARE CLEAN EVENT");
  await page.getByRole("button", { name: "Review reset" }).click();
  expect(requests).toBe(0);
  await expect(
    page.getByText("Final confirmation:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm reset" }).click();
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("confirmation dialog supports Escape and participant snapshot failure is visible", async ({
  page,
}) => {
  const f = fixtures();
  await routeParticipant(page, f.participant);
  await page.goto("http://127.0.0.1:4401/participant");
  await page.getByRole("button", { name: "Add chatbot", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.unroute("**/api/snapshot?scope=participant");
  await page.route("**/api/snapshot?scope=participant", (r) =>
    r.fulfill({ status: 503, json: { error: "Unable to synchronize." } }),
  );
  await page
    .getByRole("button", { name: "Synchronize authoritative state" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Unable to synchronize");
});

test("continuous reconciliation signals do not starve a slow authoritative snapshot", async ({
  page,
}) => {
  const data = fixtures().participant;
  await page.route("**/api/snapshot?scope=participant", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ json: data });
  });
  await page.goto("http://127.0.0.1:4401/participant");
  await page.evaluate(() => {
    const signal = setInterval(
      () => window.dispatchEvent(new Event("online")),
      80,
    );
    setTimeout(() => clearInterval(signal), 2500);
  });
  await expect(page.locator(".completion-number")).toHaveText("1 / 10", {
    timeout: 1800,
  });
});
