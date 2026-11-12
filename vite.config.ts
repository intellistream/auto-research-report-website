import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode, command, isPreview }) => {
  const localReports = mode === "docx" && command === "serve" && !isPreview;
  const pipelinePreview = mode === "pipeline" && command === "serve" && !isPreview;
  const env = loadEnv(mode, ".", "");
  if (pipelinePreview && !env.VITE_DAILY_REPORTS_DIR) {
    throw new Error("Set VITE_DAILY_REPORTS_DIR to the pipeline import --output directory.");
  }
  return {
    // Project pages serve from /<repo>/; local dev and custom domains use "/".
    base: localReports || pipelinePreview ? "/" : env.VITE_BASE_PATH || "/",
    publicDir: pipelinePreview ? env.VITE_DAILY_REPORTS_DIR : localReports ? "../work/docx-preview" : "public",
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    preview: { port: 5173, strictPort: true },
  };
});
