import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEARNINGS, findLearningBySlug, learningPdfUrl } from "./catalog.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("every learning entry has unique slug, ISO date, EN/ZH copy, safe filename, and existing PDF", () => {
  assert.ok(LEARNINGS.length >= 1);
  const slugs = new Set();

  for (let i = 0; i < LEARNINGS.length; i += 1) {
    const item = LEARNINGS[i];
    assert.ok(!slugs.has(item.slug), `duplicate slug: ${item.slug}`);
    slugs.add(item.slug);

    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/, `date must be YYYY-MM-DD: ${item.date}`);
    assert.match(item.slug, /^[a-z0-9-]+$/, `slug must be URL-safe: ${item.slug}`);
    assert.match(item.fileName, /^[a-z0-9-]+\.pdf$/, `fileName must be safe PDF basename: ${item.fileName}`);
    assert.ok(item.title?.en && item.title?.zh, "EN and ZH titles required");
    assert.ok(item.summary?.en && item.summary?.zh, "EN and ZH summaries required");

    if (i > 0) {
      assert.ok(LEARNINGS[i - 1].date >= item.date, "LEARNINGS must be sorted newest-first");
    }

    const pdfPath = path.join(REPO_ROOT, "docs", "learnings", item.fileName);
    assert.ok(fs.existsSync(pdfPath), `missing PDF on disk: ${pdfPath}`);
    const stat = fs.statSync(pdfPath);
    assert.ok(stat.size > 1000, "PDF file must be non-empty");
    const header = fs.readFileSync(pdfPath).subarray(0, 5).toString("ascii");
    assert.equal(header, "%PDF-", "file must start with PDF magic header");
  }
});

test("findLearningBySlug resolves known slugs and rejects traversal/unknown values", () => {
  const first = LEARNINGS[0];
  assert.equal(findLearningBySlug(first.slug)?.fileName, first.fileName);
  assert.equal(findLearningBySlug("../package.json"), null);
  assert.equal(findLearningBySlug("does-not-exist"), null);
  assert.equal(findLearningBySlug(""), null);
  assert.equal(findLearningBySlug(null), null);
  assert.equal(findLearningBySlug(undefined), null);
  assert.equal(findLearningBySlug(123), null);
});

test("learningPdfUrl builds inline and download API paths", () => {
  assert.equal(
    learningPdfUrl("2026-11-25-chase-zelle-ingestion-system-design"),
    "/api/learnings/2026-11-25-chase-zelle-ingestion-system-design"
  );
  assert.equal(
    learningPdfUrl("2026-11-25-chase-zelle-ingestion-system-design", { download: true }),
    "/api/learnings/2026-11-25-chase-zelle-ingestion-system-design?download=1"
  );
});
