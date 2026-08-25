/** Spawns backend + frontend dev servers together; Ctrl-C stops both. */
const procs: Deno.ChildProcess[] = [];

const tasks: Array<{ cmd: string; args: string[] }> = [
  { cmd: Deno.execPath(), args: ["run", "-A", "--watch", "main.ts"] },
  { cmd: Deno.execPath(), args: ["run", "-A", "npm:vite"] },
];

for (const t of tasks) {
  const child = new Deno.Command(t.cmd, {
    args: t.args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  procs.push(child);
}

const shutdown = () => {
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {
      // already dead
    }
  }
};

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

await Promise.any(procs.map((p) => p.status));
shutdown();
Deno.exit(0);
