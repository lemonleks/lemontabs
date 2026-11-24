import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  base: "./",
  build: {
    target: "chrome120",
    modulePreload: false,
    rollupOptions: {
      input: { newtab: "index.html", background: "src/background.ts" },
      output: {
        // manifest.json points at background.js, so it needs a stable name.
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
});
