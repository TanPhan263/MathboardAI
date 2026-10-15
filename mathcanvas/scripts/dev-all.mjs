// Start the handwriting API (../mathcanvas-api) and the web app together.
//   npm run dev:all      both, with reload on change
//   npm run api          only the API
// Ctrl+C stops both. The API runs from its own venv (see mathcanvas-api/README.md).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = path.resolve(web, "../mathcanvas-api");
const python = [".venv/Scripts/python.exe", ".venv/bin/python"].map((p) => path.join(api, p)).find(existsSync);
if (!python) {
  console.error(`No Python venv in ${api}. Set it up first (mathcanvas-api/README.md).`);
  process.exit(1);
}

const children = [];
function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" && cmd === "npx", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  const tag = (chunk) => chunk.toString().replace(/^(?=.)/gm, `[${name}] `);
  child.stdout.on("data", (c) => process.stdout.write(tag(c)));
  child.stderr.on("data", (c) => process.stderr.write(tag(c)));
  child.on("exit", (code) => {
    console.log(`[${name}] exited (${code})`);
    stop();
  });
  children.push(child);
}
function stop() {
  for (const c of children) if (c.exitCode === null) c.kill();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

run("api", python, ["-m", "uvicorn", "app.main:app", "--port", "8000", "--reload", "--reload-dir", "app"], api);
if (!process.argv.includes("--api-only")) run("web", "npx", ["next", "dev"], web);
