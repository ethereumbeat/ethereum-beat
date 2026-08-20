# /api/metric/{key}

Time series for a single Ethereum protocol-health metric. Read-only, public,
`Access-Control-Allow-Origin: *`. No auth, no key.

    GET https://ethereumbeat.org/api/metric/{key}?range=<d|w|m|q|y>
    Content-Type: application/json
    Cache-Control: public, s-maxage=3600, max-age=300

## Parameters

- `{key}` — a `metric_key`. **Discover valid keys from**
  <https://ethereumbeat.org/api/snapshot> (the `metrics[].metric_key` values). The
  key list lives in D1 and is deliberately not hardcoded anywhere.
- `range` — one of `d` (day), `w` (week), `m` (month), `q` (quarter), `y` (year).
  Defaults to `d`. Any other value returns **HTTP 400**.

An unknown `{key}` returns **HTTP 404**.

## Response

    {
      "meta":     { ... },            // the metric_meta row: label, unit, category, source, ...
      "range":    "<d|w|m|q|y>",
      "points":   [ { "date": "<YYYY-MM-DD>", "value": <number> }, ... ],
      "coverage": { "first": "<YYYY-MM-DD>", "last": "<YYYY-MM-DD>" }
    }

Scope: protocol health only — no prices, no market data.
