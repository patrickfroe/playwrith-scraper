import express from "express";
import path from "node:path";
import { createRenderRouter } from "./routes/render";
import { ArtifactStore } from "./store/artifactStore";
import type { RenderOptions, RenderResult } from "./render/renderPage";

interface AppDeps {
  store?: ArtifactStore;
  renderer?: (url: string, options: RenderOptions) => Promise<RenderResult>;
}

export function createApp(deps: AppDeps = {}): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const store = deps.store ?? new ArtifactStore(15 * 60_000);
  app.use(createRenderRouter({ store, renderer: deps.renderer }));

  const uiPath = path.join(process.cwd(), "src", "ui");
  app.use(express.static(uiPath));

  app.get("/", (_, res) => {
    res.sendFile(path.join(uiPath, "index.html"));
  });

  return app;
}
