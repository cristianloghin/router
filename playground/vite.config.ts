import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The playground consumes the library straight from src/ so edits to the
// library hot-reload in the browser without a build step.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mikrostack/router": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5199,
  },
});
