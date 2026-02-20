import { Readability } from "readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

export interface MarkdownExtractionResult {
  title: string;
  markdownText: string;
}

const turndown = new TurndownService();

export function extractMarkdownFromHtml(html: string, finalUrl: string): MarkdownExtractionResult {
  const dom = new JSDOM(html, { url: finalUrl });
  const parsed = new Readability(dom.window.document).parse();

  if (!parsed?.content) {
    return { title: "", markdownText: "" };
  }

  return {
    title: parsed.title ?? "",
    markdownText: turndown.turndown(parsed.content)
  };
}
