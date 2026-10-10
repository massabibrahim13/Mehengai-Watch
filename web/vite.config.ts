import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" = relative asset paths, so the built site works on any host path (GitHub Pages too).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
});
