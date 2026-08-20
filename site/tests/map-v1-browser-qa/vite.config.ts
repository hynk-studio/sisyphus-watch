import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const siteRoot = fileURLToPath(new URL("../..", import.meta.url));
const harnessHtml = fileURLToPath(new URL("./index.html", import.meta.url));

export default defineConfig({
  root: siteRoot,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4179,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4179,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: harnessHtml,
    },
  },
});
