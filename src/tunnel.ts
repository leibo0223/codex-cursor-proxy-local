import { spawn, type ChildProcess } from "node:child_process";

export class CloudflaredTunnel {
  private process: ChildProcess | undefined;
  private shuttingDown = false;

  constructor(
    private readonly port: number,
    private readonly onPrematureExit: (message: string) => void,
  ) {}

  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${this.port}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.process = tunnel;

      let urlResolved = false;
      let settled = false;
      let logs = "";
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.process = undefined;
        tunnel.kill("SIGTERM");
        reject(new Error("Timed out waiting for cloudflared to create a quick tunnel."));
      }, 45_000);

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        logs = (logs + text).slice(-20_000);
        const match = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (!match || settled) return;

        settled = true;
        urlResolved = true;
        clearTimeout(timeout);
        resolve(match[0]);
      };

      tunnel.stdout.on("data", handleOutput);
      tunnel.stderr.on("data", handleOutput);
      tunnel.on("error", (err) => {
        if (settled) return;
        settled = true;
        this.process = undefined;
        clearTimeout(timeout);
        reject(err);
      });
      tunnel.on("exit", (code, signal) => {
        this.process = undefined;
        if (urlResolved) {
          if (!this.shuttingDown) {
            this.onPrematureExit(`cloudflared exited (${signal ?? code}); the public URL is no longer available.`);
          }
          return;
        }
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited before creating a tunnel (${signal ?? code}).\n${logs}`));
      });
    });
  }

  stop() {
    this.shuttingDown = true;
    this.process?.kill("SIGTERM");
  }
}
