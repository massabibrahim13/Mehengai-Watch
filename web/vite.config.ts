import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" = relative asset paths, so the built site works on any host path (GitHub Pages too).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  // The chart library is one ~700 kB file (~235 kB compressed), downloaded only when the first chart appears
  // (src/lib/echarts.ts); the first screen needs ~130 kB. So a large chunk here is expected, not a problem.
  build: { chunkSizeWarningLimit: 750 },
});
