import type { BrowserContext, Frame, Page } from "playwright";

type ConsentOptions = {
  debug?: boolean;
  timeoutMs?: number;
  targetUrl?: string;
};

const DEFAULT_TIMEOUT_MS = 400;

const CMP_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "#CybotCookiebotDialogBodyLevelButtonAccept",
  '[data-testid="didomi-accept-button"]',
  "#truste-consent-button",
  "button#truste-consent-button",
  "#trustarc-accept-btn",
  'button[title="TrustArc Cookie Consent Manager"]',
  'button[mode="primary"][data-action="accept"]',
  'button[mode="primary"][data-action="agree"]',
  'button[aria-label*="Quantcast" i][aria-label*="Accept" i]',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  '[data-testid="uc-accept-all-button"]',
  "#uc-btn-accept-banner",
  'button[data-testid="uc-accept-all-button"]'
];

const ACCEPT_KEYWORDS = [
  "accept",
  "agree",
  "allow",
  "got it",
  "ok",
  "akzeptieren",
  "alle akzeptieren",
  "zustimmen",
  "agree all",
  "accept all",
  "allow all"
];

const LOCAL_STORAGE_DEFAULTS: Record<string, string> = {
  cookieConsent: "true",
  consent: "true",
  gdpr_consent: "true",
  OptanonConsent: "isGpcEnabled=0&datestamp=1970-01-01T00:00:00.000Z&version=6.33.0",
  "euconsent-v2": "placeholder",
  didomi_token: "placeholder"
};

function debugLog(debug: boolean, message: string, details?: unknown): void {
  if (!debug) {
    return;
  }
  if (details !== undefined) {
    console.debug(`[cookie-consent] ${message}`, details);
    return;
  }
  console.debug(`[cookie-consent] ${message}`);
}

async function tryClickSelector(frame: Frame, selector: string, timeoutMs: number, debug: boolean): Promise<boolean> {
  try {
    const locator = frame.locator(selector).first();
    if (!(await locator.isVisible({ timeout: timeoutMs }))) {
      return false;
    }
    await locator.click({ timeout: timeoutMs });
    debugLog(debug, `Clicked selector: ${selector}`);
    return true;
  } catch {
    return false;
  }
}

async function clickInsideShadowDom(frame: Frame, keywords: string[], debug: boolean): Promise<boolean> {
  try {
    const clicked = await frame.evaluate((keywordList) => {
      const normalizedKeywords = keywordList.map((value) => value.toLowerCase());

      const isVisible = (el: Element): boolean => {
        const style = window.getComputedStyle(el as HTMLElement);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };

      const hasCookieContext = (el: Element): boolean => {
        const ownText = (el.textContent || "").toLowerCase();
        if (ownText.includes("cookie") || ownText.includes("consent") || ownText.includes("gdpr")) {
          return true;
        }
        const parentText = (el.parentElement?.textContent || "").toLowerCase();
        return parentText.includes("cookie") || parentText.includes("consent") || parentText.includes("gdpr");
      };

      const getActionableText = (el: Element): string => {
        if (el instanceof HTMLInputElement) {
          return `${el.value || ""} ${el.getAttribute("aria-label") || ""}`.trim();
        }
        return `${el.textContent || ""} ${el.getAttribute("aria-label") || ""}`.trim();
      };

      const clickCandidate = (root: ParentNode): boolean => {
        const candidates = root.querySelectorAll(
          'button, [role="button"], input[type="button"], input[type="submit"], a, div[role="button"], span[role="button"]'
        );

        for (const element of candidates) {
          if (!isVisible(element)) {
            continue;
          }

          const text = getActionableText(element).toLowerCase();
          if (!text) {
            continue;
          }

          if (!normalizedKeywords.some((keyword) => text.includes(keyword))) {
            continue;
          }

          if (!hasCookieContext(element)) {
            continue;
          }

          (element as HTMLElement).click();
          return true;
        }

        const nested = root.querySelectorAll("*");
        for (const element of nested) {
          if ((element as HTMLElement).shadowRoot && clickCandidate((element as HTMLElement).shadowRoot as ShadowRoot)) {
            return true;
          }
        }

        return false;
      };

      return clickCandidate(document);
    }, keywords);

    if (clicked) {
      debugLog(debug, "Clicked consent control via shadow DOM scan");
    }

    return clicked;
  } catch {
    return false;
  }
}

async function clickByKeywords(frame: Frame, timeoutMs: number, debug: boolean): Promise<boolean> {
  const selectors = [
    "button:visible",
    '[role="button"]:visible',
    'input[type="button"]:visible',
    'input[type="submit"]:visible',
    "a:visible",
    'div[role="button"]:visible'
  ];

  for (const keyword of ACCEPT_KEYWORDS) {
    for (const selector of selectors) {
      try {
        const locator = frame.locator(selector).filter({ hasText: new RegExp(keyword, "i") }).first();
        if (!(await locator.isVisible({ timeout: timeoutMs }))) {
          continue;
        }
        await locator.click({ timeout: timeoutMs });
        debugLog(debug, `Clicked keyword '${keyword}' with selector '${selector}'`);
        return true;
      } catch {
        continue;
      }
    }
  }

  return clickInsideShadowDom(frame, ACCEPT_KEYWORDS, debug);
}

async function runFrameConsentPass(frame: Frame, timeoutMs: number, debug: boolean): Promise<boolean> {
  for (const selector of CMP_SELECTORS) {
    if (await tryClickSelector(frame, selector, timeoutMs, debug)) {
      return true;
    }
  }

  return clickByKeywords(frame, timeoutMs, debug);
}

function getConsentCookieValues(): Array<{ name: string; value: string }> {
  return [
    { name: "cookieConsent", value: "true" },
    { name: "consent", value: "true" },
    { name: "gdpr_consent", value: "true" },
    { name: "OptanonConsent", value: LOCAL_STORAGE_DEFAULTS.OptanonConsent },
    { name: "euconsent-v2", value: "placeholder" },
    { name: "didomi_token", value: "placeholder" }
  ];
}

export async function prepareConsent(context: BrowserContext, page: Page, options: ConsentOptions = {}): Promise<void> {
  const debug = Boolean(options.debug);
  const targetCandidates = [options.targetUrl, page.url(), "https://example.com", "https://localhost"].filter(
    (value): value is string => Boolean(value && value.startsWith("http"))
  );

  try {
    const cookies = targetCandidates.flatMap((url) =>
      getConsentCookieValues().map((cookie) => ({
        ...cookie,
        url,
        path: "/"
      }))
    );

    if (cookies.length > 0) {
      await context.addCookies(cookies);
      debugLog(debug, `Seeded ${cookies.length} pre-consent cookies`);
    }
  } catch (error) {
    debugLog(debug, "Unable to set context cookies", error);
  }

  await page.addInitScript((storageDefaults) => {
    try {
      Object.entries(storageDefaults).forEach(([key, value]) => {
        window.localStorage.setItem(key, value);
      });

      document.cookie = "cookieConsent=true; path=/; SameSite=Lax";
      document.cookie = "consent=true; path=/; SameSite=Lax";
      document.cookie = "gdpr_consent=true; path=/; SameSite=Lax";
      document.cookie = "euconsent-v2=placeholder; path=/; SameSite=Lax";
      document.cookie = "didomi_token=placeholder; path=/; SameSite=Lax";
    } catch {
      // Ignore storage access failures.
    }
  }, LOCAL_STORAGE_DEFAULTS);

  debugLog(debug, "Registered pre-navigation consent init script");
}

export async function handleCookieConsent(page: Page, context: BrowserContext, options: ConsentOptions = {}): Promise<void> {
  const debug = Boolean(options.debug);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    await prepareConsent(context, page, options);
  } catch {
    // Ignore seeding failures.
  }

  try {
    const frames = page.frames();
    for (const frame of frames) {
      try {
        if (await runFrameConsentPass(frame, timeoutMs, debug)) {
          return;
        }
      } catch (error) {
        debugLog(debug, "Frame consent pass failed (possibly cross-origin)", error);
      }
    }
  } catch (error) {
    debugLog(debug, "Consent frame iteration failed", error);
  }

  try {
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      for (const element of candidates) {
        const text = `${element.className || ""} ${element.id || ""} ${element.getAttribute("aria-label") || ""} ${
          element.textContent || ""
        }`.toLowerCase();

        if (!text.includes("cookie") && !text.includes("consent")) {
          continue;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const isBlocking =
          (style.position === "fixed" || style.position === "sticky") &&
          rect.width > window.innerWidth * 0.3 &&
          rect.height > 40 &&
          rect.top < window.innerHeight;

        if (!isBlocking) {
          continue;
        }

        element.remove();
      }

      document.body.style.removeProperty("overflow");
      document.documentElement.style.removeProperty("overflow");

      const pointerBlocks = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => {
        const style = window.getComputedStyle(element);
        return style.pointerEvents === "auto" && style.position === "fixed" && Number.parseInt(style.zIndex || "0", 10) > 999;
      });

      for (const element of pointerBlocks) {
        const text = `${element.className || ""} ${element.id || ""}`.toLowerCase();
        if (text.includes("cookie") || text.includes("consent") || text.includes("overlay")) {
          element.remove();
        }
      }
    });

    debugLog(debug, "Applied conservative consent overlay fallback cleanup");
  } catch (error) {
    debugLog(debug, "Overlay fallback failed", error);
  }
}
