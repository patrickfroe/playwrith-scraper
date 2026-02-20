import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app";
import { ArtifactStore } from "../src/store/artifactStore";

const fakeRenderer = async () => ({
  screenshotBuffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  markdownText: "# Hello\n\nWorld",
  metadata: {
    title: "Example Domain",
    finalUrl: "https://example.com",
    status: 200,
    contentType: "text/html; charset=utf-8",
    timings: {
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      ms: 123
    }
  }
});

const validPayload = {
  url: "https://example.com",
  options: {
    waitUntil: "networkidle",
    timeoutMs: 30000,
    viewportPreset: "Desktop (1280x720)",
    fullPage: true,
    waitForSelector: "",
    userAgent: "",
    blockResources: []
  }
};

test("returns 400 when URL is missing", async () => {
  const app = createApp({ renderer: fakeRenderer });
  const res = await request(app).post("/render").send({ options: {} });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "INVALID_INPUT");
});

test("returns 422 for blocked SSRF URL", async () => {
  const app = createApp({ renderer: fakeRenderer });
  const res = await request(app)
    .post("/render")
    .send({ ...validPayload, url: "http://127.0.0.1" });

  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, "BLOCKED_URL");
});

test("returns jobId and allows downloading png+md", async () => {
  const app = createApp({ renderer: fakeRenderer });
  const renderRes = await request(app).post("/render").send(validPayload);

  assert.equal(renderRes.status, 200);
  assert.ok(renderRes.body.jobId);
  assert.ok(renderRes.body.downloadUrls.png.includes("/render/"));
  assert.ok(renderRes.body.downloadUrls.md.includes("/render/"));

  const pngRes = await request(app).get(renderRes.body.downloadUrls.png);
  assert.equal(pngRes.status, 200);
  assert.equal(pngRes.headers["content-type"], "image/png");
  assert.ok(Buffer.from(pngRes.body).length > 0);

  const mdRes = await request(app).get(renderRes.body.downloadUrls.md);
  assert.equal(mdRes.status, 200);
  assert.ok(mdRes.headers["content-type"].includes("text/markdown"));
  assert.ok(mdRes.text.length > 0);
});

test("expires artifacts after TTL", async () => {
  const store = new ArtifactStore(5, 2);
  const app = createApp({ store, renderer: fakeRenderer });

  const renderRes = await request(app).post("/render").send(validPayload);
  assert.equal(renderRes.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 20));

  const pngRes = await request(app).get(renderRes.body.downloadUrls.png);
  assert.equal(pngRes.status, 404);
  store.shutdown();
});
