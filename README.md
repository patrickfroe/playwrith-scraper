# Render URL → Screenshot + Markdown

Eine kleine Node.js + TypeScript Web-App, die eine URL serverseitig mit **Playwright (Chromium)** rendert, einen **PNG-Screenshot** erzeugt und den Hauptinhalt als **Markdown** extrahiert.

## Voraussetzungen

- Node.js 20+ (empfohlen: aktuelles LTS)
- npm
- Playwright-Browser (Chromium)

## Installation

```bash
npm install
npx playwright install chromium
```

## Applikation starten

### Entwicklung

```bash
npm run dev
```

Server läuft dann standardmäßig auf:

- `http://localhost:3000`

### Produktion (Build + Start)

```bash
npm run build
npm start
```

## Nutzung

1. Browser öffnen: `http://localhost:3000`
2. URL eintragen (z. B. `https://example.com`)
3. Optional Advanced Settings anpassen
4. Auf **Render** klicken
5. Screenshot + Markdown-Preview prüfen
6. Über **Download PNG** / **Download MD** herunterladen


## Cookie-Consent Helper

Für wiederverwendbare Scraping-Flows gibt es jetzt eine Utility mit Pre-Consent und Banner-Handling:

```ts
import { prepareConsent, handleCookieConsent } from "./src/render/cookieConsent";

await prepareConsent(context, page);
await page.goto(url);
await handleCookieConsent(page, context);
```

## API Kurzüberblick

- `POST /render`
- `GET /render/:jobId/screenshot.png`
- `GET /render/:jobId/page.md`

## Tests

```bash
npm test
```

## Hinweise

- Artefakte werden nur temporär im Speicher gehalten (TTL: 15 Minuten).
- SSRF-Schutz blockiert lokale/private Ziele (z. B. `127.0.0.1`, `localhost`, private Netze).
