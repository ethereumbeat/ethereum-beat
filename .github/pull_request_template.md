<!-- One logical change per PR. Describe what and why; link the issue. -->

## What & why

<!-- What does this change, and why? Link the issue it closes. -->

Closes #

## Before / after

<!-- For anything visual, include before/after notes or screenshots (both themes). -->

## Quality gates (from CONTRIBUTING.md)

- [ ] `npm run build` is clean
- [ ] `node scripts/audit-contrast.mjs` green (WCAG contrast, all routes / themes / viewports)
- [ ] `node scripts/audit-meta.mjs` green (per-route title / description / canonical / OG / JSON-LD)
- [ ] Works in **both** themes (INK and BONE)
- [ ] Respects `prefers-reduced-motion` (no essential info behind animation)
- [ ] Works at mobile **and** desktop viewports
- [ ] Type rule kept: pixel (Departure) for live data, lowercase grotesk for human labels
- [ ] No price / market-cap / trading framing
- [ ] `DECISIONS.md` updated if a non-obvious trade-off was made

## Adding a metric? (delete if N/A)

- [ ] `metric_meta` row: label, one of the four CROPS categories (CR/O/P/S), unit, agg_mode, description, source_name, source_url, caption?, featured, sort
- [ ] source module under `worker/sources/` with try/catched `fetchDaily()`, endpoint verified with `curl`
- [ ] `npm run seed` run so all ranges backfill
