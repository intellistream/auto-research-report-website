import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./style.css";
const DocxPreview = import.meta.env.DEV && import.meta.env.MODE === "docx"
  ? lazy(() => import("./pages/DocxPreview"))
  : null;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      {DocxPreview ? (
        <Suspense fallback={<p role="status">正在打开本地预览…</p>}>
          <DocxPreview />
        </Suspense>
      ) : <App />}
    </HashRouter>
  </React.StrictMode>,
);
