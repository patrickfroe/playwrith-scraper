import { JSDOM } from "jsdom";
import TurndownService from "turndown";

export interface MarkdownExtractionResult {
  title: string;
  markdownText: string;
}

const turndown = new TurndownService();

function getPrimaryContent(document: Document): string {
  const articleLike = document.querySelector("article, main, [role='main']");
  if (articleLike) {
    return articleLike.innerHTML;
  }

  if (document.body) {
    return document.body.innerHTML;
  }

  return "";
}

export function extractMarkdownFromHtml(html: string, finalUrl: string): MarkdownExtractionResult {
  const dom = new JSDOM(html, { url: finalUrl });
  const title = dom.window.document.title ?? "";
  const contentHtml = getPrimaryContent(dom.window.document);

  if (!contentHtml) {
    return { title, markdownText: "" };
  }

  return {
    title,
    markdownText: turndown.turndown(contentHtml)
  };
}
