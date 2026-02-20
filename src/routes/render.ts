import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { renderPage, viewportPresets, type RenderOptions, type RenderResult } from "../render/renderPage";
import { validatePublicHttpUrl } from "../security/ssrf";
import { ArtifactStore } from "../store/artifactStore";

const renderRequestSchema = z.object({
  url: z.string().url(),
  options: z.object({
    waitUntil: z.enum(["networkidle", "load", "domcontentloaded"]).default("networkidle"),
    timeoutMs: z.number().int().min(1).max(120000).default(30000),
    viewportPreset: z.enum(Object.keys(viewportPresets) as [keyof typeof viewportPresets, ...(keyof typeof viewportPresets)[]]).default("Desktop (1280x720)"),
    fullPage: z.boolean().default(true),
    waitForSelector: z.string().optional().default(""),
    userAgent: z.string().optional().default(""),
    blockResources: z.array(z.enum(["images", "fonts", "media"])).default([])
  })
});

interface RouterDeps {
  store: ArtifactStore;
  renderer?: (url: string, options: RenderOptions) => Promise<RenderResult>;
}

export function createRenderRouter({ store, renderer = renderPage }: RouterDeps): Router {
  const router = Router();

  router.post("/render", async (req, res) => {
    const parsed = renderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: parsed.error.issues[0]?.message ?? "Invalid request payload."
        }
      });
    }

    const { url, options } = parsed.data;

    try {
      await validatePublicHttpUrl(url);
    } catch (error) {
      return res.status(422).json({
        error: {
          code: "BLOCKED_URL",
          message: error instanceof Error ? error.message : "URL blocked"
        }
      });
    }

    const jobId = randomUUID();
    try {
      const result = await renderer(url, options);
      store.set(jobId, {
        screenshotBuffer: result.screenshotBuffer,
        markdownText: result.markdownText,
        metadata: result.metadata
      });

      return res.json({
        jobId,
        metadata: result.metadata,
        markdownPreview: result.markdownText.slice(0, 4000),
        downloadUrls: {
          png: `/render/${jobId}/screenshot.png`,
          md: `/render/${jobId}/page.md`
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal error";
      if (/timeout/i.test(message)) {
        return res.status(504).json({ error: { code: "TIMEOUT", message }, jobId });
      }
      return res.status(500).json({ error: { code: "INTERNAL", message }, jobId });
    }
  });

  router.get("/render/:jobId/screenshot.png", (req, res) => {
    const artifact = store.get(req.params.jobId);
    if (!artifact) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found or expired." } });
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", 'attachment; filename="page.png"');
    return res.send(artifact.screenshotBuffer);
  });

  router.get("/render/:jobId/page.md", (req, res) => {
    const artifact = store.get(req.params.jobId);
    if (!artifact) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Artifact not found or expired." } });
    }
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="page.md"');
    return res.send(artifact.markdownText);
  });

  return router;
}
