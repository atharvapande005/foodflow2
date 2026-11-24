import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

const run = (args) =>
  spawn(npm, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
  });

const children = [
  run(["run", "dev", "--prefix", "server"]),
  run(["run", "dev", "--prefix", "client"]),
];

let shuttingDown = false;
const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
};

for (const child of children) {
  child.on("exit", (code) => shutdown(code ?? 0));
  child.on("error", (error) => {
    console.error("[dev] Failed to start a process:", error);
    shutdown(1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[dev] Server → http://localhost:5000   Client → http://localhost:3000");
