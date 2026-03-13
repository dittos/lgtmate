import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const execFileAsync = promisify(execFile);

function githubProxyPlugin(): Plugin {
  return {
    name: "lgtmate-api",
    configureServer(server) {
      server.middlewares.use("/api/health", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      });

      server.middlewares.use("/api/github/status", async (_req, res) => {
        res.setHeader("Content-Type", "application/json");

        try {
          const { stdout } = await execFileAsync("gh", ["auth", "status"]);
          res.end(JSON.stringify({ ok: true, output: stdout.trim() }));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown GitHub CLI error";
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), githubProxyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
