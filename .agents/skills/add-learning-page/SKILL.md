---
name: add-learning-page
description: >-
  Generate a crisp, visually verified 2-page Full-Stack and AI System Design
  Brief PDF summarizing recently designed and shipped work, save it under
  docs/learnings/YYYY-MM-DD-<slug>.pdf, and register it in Keyturn's Learnings
  section (lib/learnings/catalog.js). Use whenever the user says "add a page to
  my learnings" or asks to save a system design summary to the Learnings section.
---

# Add a Page to Keyturn Learnings

Use this procedure after completing a substantive system design, feature, or debugging effort when the user asks to add a page to their Learnings section.

## Content & Abstraction Rules

1. **System-design altitude:** Write at a high systems-design level. Skip file-by-file trivia, line numbers, regex details, and low-level code snippets. Focus on architecture, boundaries, tradeoffs, and reusable engineering rules.
2. **Preserve exact names (never genericize):** Keep every specific technology, software, protocol, API, SDK, database feature, and engineering concept name verbatim (for example: `Next.js 16`, `Supabase / PostgreSQL`, `RLS`, `Service Role`, `Svix HMAC-SHA256`, `Claim-Check`, `Claude Haiku`, `IDOR`, `Hexagonal Seams`). The goal is to reinforce full-stack engineering vocabulary.
3. **No em dashes:** Use commas, periods, parentheses, or regular hyphens (`-`).
4. **No real PII or secrets:** Never include real tenant names, emails, addresses, phone numbers, API keys, or tokens.

## Fixed 2-Page Layout

Start from [template.html](./resources/template.html) (copied from the verified Chase Zelle brief). Keep the exact 4-section, 2-page Letter layout:

- **Page 1:**
  - **Header:** Eyebrow (`Full-Stack & AI System Design Brief`), title, and right-aligned metadata (`App`, `Services`, `Date`).
  - **System Goal lead box:** 1-paragraph summary of the problem and reliability goal.
  - **Section 1 - High-Level System Architecture:** Inline SVG flow diagram (`viewBox="0 0 760 180"`) showing primary end-to-end stages on row 1, feedback/control plane and cross-cutting guarantees on row 2, and a concise caption.
  - **Section 2 - Core Architectural Tradeoffs:** 3-column table (`System Concept` | `Chosen Design & Rationale` | `Rejected Alternative & Why`), 4-5 rows.
- **Page 2 (after `.page-break`):**
  - **Section 3 - Full-Stack Engineering & Delivery Patterns:** 2x2 card grid highlighting durable architecture, delivery, state, and operational patterns used.
  - **Section 4 - Real System Failure Modes Caught & Reusable Engineering Rules:** 3-column table (`Concept & Failure Mode` | `What Happened in Keyturn` | `Reusable Full-Stack System Rule`), 4-6 rows drawn from real review findings, bugs, or production debugging.
  - **Core Takeaway callout + footer:** 1-paragraph takeaway and bottom summary line.

## Steps

1. **Draft the HTML:** Copy [template.html](./resources/template.html) into your conversation scratch directory (for example `scratch/<slug>.html`) and replace the copy and inline SVG with the completed project's architecture, tradeoffs, patterns, and failure modes.
2. **Verify zero em dashes:** Confirm no `—` characters appear in the HTML.
3. **Render PDF via headless Chrome:**
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless=new \
     --disable-gpu \
     --no-pdf-header-footer \
     --print-to-pdf="docs/learnings/YYYY-MM-DD-<slug>.pdf" \
     "file:///absolute/path/to/scratch/<slug>.html"
   ```
   - File naming: `docs/learnings/YYYY-MM-DD-<slug>.pdf` using today's local date and lowercase hyphenated slug matching `/^[a-z0-9-]+$/`.
4. **Visually inspect every page:** Open the rendered PDF with `read_file`. Verify:
   - Exactly **2 balanced pages** (no spillover onto page 3).
   - Zero clipped SVG labels, overlapping arrows, or orphan lines.
   - If anything overflows or clips, tighten `@page` margins, table cell padding, or SVG box widths and re-render until visually clean.
5. **Register in the Learnings catalog:** Prepend the new entry **first** (newest-first order) in `lib/learnings/catalog.js` with:
   - `slug`: `"YYYY-MM-DD-<slug>"`
   - `date`: `"YYYY-MM-DD"`
   - `fileName`: `"YYYY-MM-DD-<slug>.pdf"`
   - `title`: `{ en: "...", zh: "..." }`
   - `summary`: `{ en: "...", zh: "..." }`
   - `tags`: 5-7 exact technology/concept tags
6. **Verify:** Run `npm test` (which validates `lib/learnings/catalog.test.mjs`: unique slug, ISO date, newest-first order, safe filename, EN/ZH copy, `%PDF-` header, and non-empty file on disk) and `npm run build` (confirming `.next/server/app/api/learnings/[slug]/route.js.nft.json` traces the new PDF).
