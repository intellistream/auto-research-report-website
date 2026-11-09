import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  // Project pages serve from /<repo>/; local dev and custom domains use "/".
  base: loadEnv(mode, ".", "").VITE_BASE_PATH || "/",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
}));
