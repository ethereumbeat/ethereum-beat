# Contributing to Ethereum Beat

Thanks for considering a contribution. Ethereum Beat is an open, credibly-neutral instrument for the health of Ethereum, and it gets better when more people help read the chain honestly.

This project embodies the **O** in CROPS: it is open source, MIT-licensed, and forkable by design. Contributions are held to that same spirit, open, auditable, and free.

## Ways to contribute

- **Add a metric** (the most welcome contribution, details below)
- **Add or fix a data source** (verify a public endpoint, handle an outage gracefully)
- **Accessibility and contrast fixes** (both themes must pass the audit)
- **Bug reports** with clear reproduction steps, the route, theme, and viewport
- **Documentation** improvements

## Before you start

- Open an issue first for anything non-trivial, so we can agree on the approach before you spend time.
- Keep the mantra in mind: **no price, no speculation, no hype.** Ethereum Beat tracks protocol health and the CROPS properties, not markets. Contributions that add token price, market cap, or trading framing will be declined.
- British English, no em-dashes in copy.

## Adding a metric

Three steps:

1. **Metadata** — add a row to `metric_meta`: `label`, `category` (one of the four CROPS properties: CR, O, P, S), `unit`, `agg_mode` (`mean` / `sum` / `last`), `description` (one plain-language sentence), `source_name`, `source_url`, `caption` (optional override, e.g. "100% uptime since 2015"), `featured` (0/1), `sort`.
2. **Source module** — add a module under `worker/sources/` exporting `fetchDaily(): Promise<Array<{ metric_key, date, value }>>`. It must be individually try/catched: a failing source can never break the others. Verify the endpoint with `curl` before wiring it, and shape your parser to the real response.
3. **Seed** — run `npm run seed` to backfill history so all five ranges work immediately.

### Picking a CROPS category

Every metric must map to one of the four properties from the [EF mandate](https://ethereum.org/foundation/mandate/):

- **CR — Censorship Resistance** (e.g. node distribution, relay/builder concentration)
- **O — Open Source and Free** (e.g. client diversity, open-client counts)
- **P — Privacy**
- **S — Security** (e.g. staking economics, client diversity as attack-resistance)

Uptime and liveness are **not** a CROPS property; they are the mission CROPS protects. If your metric is a liveness signal, use the HEARTBEAT framing, not a CROPS category. If a metric plausibly fits two properties, note your reasoning in the PR.

## Development

```bash
npm install
cp .dev.vars.example .dev.vars   # optional keys; runs fine empty
npm run dev
```

The site runs fully keyless on public data. Do not commit `.dev.vars` or any real Cloudflare binding IDs.

## Quality gates (run before opening a PR)

Both must pass; they also run in CI on every PR:

```bash
npm run build
node scripts/audit-contrast.mjs   # WCAG contrast, pixel-sampled, all routes / themes / viewports
node scripts/audit-meta.mjs       # per-route title / description / canonical / OG / JSON-LD
```

New UI must:
- work in **both** themes (INK and BONE)
- respect `prefers-reduced-motion` (no essential information behind animation)
- work at mobile and desktop viewports
- keep the type rule: pixel font (Departure) for live data, lowercase grotesk for human labels

## Pull requests

- one logical change per PR
- describe what and why; link the issue
- include before/after notes for anything visual
- update `DECISIONS.md` if you made a non-obvious trade-off

## Security

Do not open a public issue for security problems. See [SECURITY.md](./SECURITY.md).

## Licence

By contributing, you agree your contributions are licensed under the [MIT License](./LICENSE), and that any data you wire in is credited with its own licence.
