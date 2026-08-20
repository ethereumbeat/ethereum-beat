# /api/snapshot

Latest snapshot of every tracked Ethereum protocol-health metric, as one JSON
document. Read-only, public, `Access-Control-Allow-Origin: *`. No auth, no key.

    GET https://ethereumbeat.org/api/snapshot
    Content-Type: application/json
    Cache-Control: public, s-maxage=3600, max-age=300

## Response

    {
      "generated_at": "<ISO 8601>",   // when the snapshot was built
      "finished_at":  "<ISO 8601>",   // when the last data collection finished
      "is_stale":     false,          // true if the data is past the freshness threshold
      "metrics": [
        {
          "metric_key":  "<string>",  // stable id — use as {key} in /api/metric/{key}
          "label":       "<string>",
          "category":    "<CROPS category>",
          "unit":        "<string>",
          "description": "<string>",
          "source_name": "<string>",
          "source_url":  "<url>",
          "latest":      { "date": "<YYYY-MM-DD>", "value": <number> },
          "spark":       [<number>, ...],   // recent series, for sparklines
          "deltas":      { ... }            // period-over-period changes
        }
      ]
    }

The `metric_key` values are defined in D1 (`metric_meta`) and can change without a
code deploy — always read the current list from this endpoint; do not hardcode it.

Use `finished_at` / `is_stale` to judge freshness.

Scope: Ethereum protocol health only — censorship resistance, open source, privacy,
security (CROPS). No prices, no market data.

Sources: growthepie (CC BY 4.0), Beacon API (PublicNode), ethernodes, beaconcha.in,
DefiLlama, ultrasound. Data under each source's terms.
