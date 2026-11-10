import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./style.css";
const Site = import.meta.env.MODE === "legacy"
  ? lazy(() => import("./App"))
  : lazy(() => import("./pages/DocxPreview"));
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Suspense fallback={<p role="status">正在打开社区研报…</p>}>
        <Site />
      </Suspense>
    </HashRouter>
  </React.StrictMode>,
);
