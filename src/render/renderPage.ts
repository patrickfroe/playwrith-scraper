import { chromium } from "playwright";
import { extractMarkdownFromHtml } from "./markdown";
import type { RenderMetadata } from "../store/artifactStore";

export const viewportPresets = {
  "Mobile (390x844)": { width: 390, height: 844 },
  "Tablet (768x1024)": { width: 768, height: 1024 },
  "Desktop (1280x720)": { width: 1280, height: 720 },
  "Desktop HD (1920x1080)": { width: 1920, height: 1080 }
} as const;

export type ViewportPresetName = keyof typeof viewportPresets;

export interface RenderOptions {
  waitUntil: "networkidle" | "load" | "domcontentloaded";
  timeoutMs: number;
  viewportPreset: ViewportPresetName;
  fullPage: boolean;
  waitForSelector?: string;
  userAgent?: string;
  blockResources: Array<"images" | "fonts" | "media">;
}

export interface RenderResult {
  screenshotBuffer: Buffer;
  markdownText: string;
  metadata: RenderMetadata;
}

export async function renderPage(url: string, options: RenderOptions): Promise<RenderResult> {
  const startedAt = new Date();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: viewportPresets[options.viewportPreset],
      userAgent: options.userAgent || undefined
    });
    const page = await context.newPage();

    if (options.blockResources.length > 0) {
      const blocked = new Set(options.blockResources);
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if ((type === "image" && blocked.has("images")) || (type === "font" && blocked.has("fonts")) || (type === "media" && blocked.has("media"))) {
          return route.abort();
        }
        return route.continue();
      });
    }

    const response = await page.goto(url, { waitUntil: options.waitUntil, timeout: options.timeoutMs });

    if (options.waitForSelector?.trim()) {
      await page.waitForSelector(options.waitForSelector.trim(), { timeout: options.timeoutMs });
    }

    const screenshotBuffer = await page.screenshot({ type: "png", fullPage: options.fullPage });
    const html = await page.content();
    const finalUrl = page.url();
    const { markdownText, title } = extractMarkdownFromHtml(html, finalUrl);

    const finishedAt = new Date();

    return {
      screenshotBuffer,
      markdownText,
      metadata: {
        title,
        finalUrl,
        status: response?.status() ?? null,
        contentType: response?.headers()["content-type"] ?? "",
        timings: {
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          ms: finishedAt.getTime() - startedAt.getTime()
        }
      }
    };
  } finally {
    await browser.close();
  }
}
