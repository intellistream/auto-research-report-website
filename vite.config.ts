import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode, command, isPreview }) => {
  const localReports = mode === "docx" && command === "serve" && !isPreview;
  return {
    // Project pages serve from /<repo>/; local dev and custom domains use "/".
    base: localReports ? "/" : loadEnv(mode, ".", "").VITE_BASE_PATH || "/",
    publicDir: localReports ? "../work/docx-preview" : "public",
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    preview: { port: 5173, strictPort: true },
  };
});
