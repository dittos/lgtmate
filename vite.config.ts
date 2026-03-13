import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { githubProxyPlugin } from "./server/github-proxy-plugin";

export default defineConfig({
  plugins: [tailwindcss(), react(), githubProxyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
