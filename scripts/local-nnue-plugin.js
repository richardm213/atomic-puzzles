import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";

// Local research models stay outside the browser bundle and production hosting.
export const localNnuePlugin = () => ({
  name: "local-nnue-opponent",
  configureServer(server) {
    const python = resolve("nnue/.venv/bin/python");
    const entry = resolve("scripts/practice-opponent.py");
    const checkpoint = resolve("nnue/runs/rechesster/native-player-v1/best.pt");
    const available = () =>
      [python, entry, checkpoint, resolve("nnue/src/predict_native_player.py")].every(existsSync);
    let worker;
    let sequence = 0;
    const pending = new Map();
    const start = () => {
      if (worker) return worker;
      const process = spawn(python, [entry], { stdio: ["pipe", "pipe", "inherit"] });
      worker = process;
      createInterface({ input: process.stdout }).on("line", (line) => {
        try {
          const response = JSON.parse(line);
          const finish = pending.get(response.id);
          if (finish) finish(response);
        } catch {
          server.config.logger.warn("Local opponent returned an invalid response");
        }
      });
      const stopped = () => {
        if (worker !== process) return;
        worker = undefined;
        for (const finish of pending.values())
          finish({ error: "Local opponent stopped. Try again." });
      };
      process.stdin.on("error", stopped);
      process.once("error", stopped);
      process.once("exit", stopped);
      return process;
    };
    server.httpServer?.once("close", () => worker?.kill());
    server.middlewares.use("/api/practice-replica", async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      const reply = (status, body) => {
        if (res.destroyed) return;
        res.statusCode = status;
        res.end(JSON.stringify(body));
      };
      if (req.method === "GET") return reply(200, { available: available() });
      if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
      if (req.headers.origin) {
        let allowed = false;
        try {
          allowed = new URL(req.headers.origin).host === req.headers.host;
        } catch {
          /* Invalid origins are rejected. */
        }
        if (!allowed) return reply(403, { error: "Origin not allowed" });
      }
      if (!available()) return reply(503, { error: "Local Rechesster model is unavailable" });
      if (pending.size >= 8) return reply(503, { error: "Local opponent is busy. Try again." });
      let body = "";
      try {
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 32_000) return reply(413, { error: "Request is too large" });
        }
        const request = JSON.parse(body);
        const id = ++sequence;
        const process = start();
        const cleanup = () => {
          clearTimeout(timer);
          pending.delete(id);
        };
        const timer = setTimeout(() => {
          cleanup();
          reply(504, { error: "Local opponent timed out. Try again." });
          process.kill();
        }, 30_000);
        pending.set(id, (response) => {
          cleanup();
          reply(response.error ? 400 : 200, response);
        });
        res.once("close", cleanup);
        process.stdin.write(`${JSON.stringify({ ...request, id })}\n`);
      } catch {
        reply(400, { error: "Invalid opponent request" });
      }
    });
  },
});
