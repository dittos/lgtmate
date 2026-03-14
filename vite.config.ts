import path from "node:path";
import devServer, { defaultOptions as honoDevServerDefaults } from "@hono/vite-dev-server";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    devServer({
      entry: "server/app.ts",
      exclude: [/^\/(?!api(?:\/|$)).*/, ...honoDevServerDefaults.exclude]
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
