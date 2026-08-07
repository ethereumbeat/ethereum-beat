# Security Policy

## Scope

This policy covers **the Ethereum Beat website (ethereumbeat.org) and its data
collector** — the Astro/Cloudflare Worker, the API routes, the daily collector,
and the build/deploy pipeline in this repository.

It does **not** cover the Ethereum protocol itself, nor the third-party data
sources the site displays. Findings in an upstream source — **growthepie,
ethernodes, beaconcha.in, PublicNode, Blobscan, DefiLlama** — belong to that
source; please report them upstream, not here. Any future onchain components
will ship with their own audited disclosure policy.

Ethereum Beat is a read-only public instrument: it has **no user accounts, no
personal data (PII), and no per-node coordinates** (node geography is
country-level aggregate only). The most relevant classes of issue are therefore:

- exposure of any secret, key, or credential in the codebase, build, or deployment
- data-integrity problems (a source parser that could be manipulated into displaying false network data)
- cross-site scripting or injection via any rendered field
- issues in the public API (`/api/*`) such as cache poisoning or resource exhaustion
- supply-chain concerns in dependencies

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report privately via either:

- **GitHub Security Advisories** — the "Report a vulnerability" button under this repository's **Security** tab (preferred), or
- **Email** — **beat+security@ethereumbeat.org**

Please include, as far as you can:

- a description of the issue and its potential impact
- steps to reproduce, or a proof of concept
- the affected route, endpoint, or component
- any suggested remediation

## What to expect

- We aim to acknowledge a report within **72 hours**.
- We will keep you updated as we investigate and work on a fix.
- There is **no bug bounty** — this is unpaid ecosystem work. Once resolved, we are happy to credit you in the advisory unless you prefer to remain anonymous.

## Secrets

If you believe a secret has been committed or exposed, treat it as urgent and email us immediately. All operational keys are rotatable; a fast report lets us rotate before any impact.

## Safe harbour

We will not pursue or support legal action against anyone who reports a vulnerability in good faith, avoids privacy violations and service disruption, and gives us reasonable time to respond before public disclosure.
