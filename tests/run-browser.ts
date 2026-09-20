import { spawn } from "node:child_process";
import chromium from "@sparticuz/chromium";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (await chromium.executablePath());
const child = spawn(
  process.execPath,
  ["node_modules/playwright/cli.js", "test", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE: executablePath },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
