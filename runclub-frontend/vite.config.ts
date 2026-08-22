import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The Express backend defaults to :3000. Everything is proxied in dev so the
// browser sees a single origin and no CORS/preflight is involved.
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/health": { target: BACKEND, changeOrigin: true },
      /**
       * Uploaded images and GPX files are stored on the backend's disk and served
       * from its static /uploads route. Without this entry the dev server answers
       * /uploads/* with its SPA fallback — index.html, status 200 — so every <img>
       * silently received HTML instead of an image and rendered as broken.
       *
       * In production the same path has to reach the backend too, via the reverse
       * proxy or by moving uploads to object storage.
       */
      "/uploads": { target: BACKEND, changeOrigin: true },
    },
  },
});
