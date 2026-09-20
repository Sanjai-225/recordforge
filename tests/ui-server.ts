import { createServer } from "node:http";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
const bundle = await build({
  entryPoints: ["tests/ui-entry.tsx"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  alias: {
    "next/link": "./tests/link-stub.tsx",
    "next/navigation": "./tests/navigation-stub.ts",
  },
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": '""',
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": '""',
    "process.env.NODE_ENV": '"production"',
  },
});
const cssFiles = (await readdir(".next/static/chunks")).filter((n) =>
  n.endsWith(".css"),
);
const css = (
  await Promise.all(
    cssFiles.map((n) => readFile(`.next/static/chunks/${n}`, "utf8")),
  )
).join("\n");
createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(bundle.outputFiles[0].text);
  } else if (request.url === "/style.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(css);
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
    );
  }
}).listen(4401, "127.0.0.1", () =>
  console.log(
    "Isolated UI fixture listening. API responses are intercepted by Playwright.",
  ),
);
