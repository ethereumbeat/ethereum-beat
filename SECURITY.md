# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report vulnerabilities privately via either:

- **GitHub Security Advisories** — the "Report a vulnerability" button under this repository's **Security** tab (preferred), or
- **Email** — **security@ethereumbeat.org**

Please include, as far as you can:

- a description of the issue and its potential impact
- steps to reproduce, or a proof of concept
- the affected route, endpoint, or component
- any suggested remediation

## What to expect

- We aim to acknowledge a report within **72 hours**.
- We will keep you updated as we investigate and work on a fix.
- Once resolved, we are happy to credit you in the advisory unless you prefer to remain anonymous.

## Scope

Ethereum Beat is a read-only public instrument. It holds no user accounts, no user funds, and no private user data. The most relevant classes of issue are therefore:

- exposure of any secret, key, or credential in the codebase, build, or deployment
- data-integrity problems (a source parser that could be manipulated into displaying false network data)
- cross-site scripting or injection via any rendered field
- issues in the public API (`/api/*`) such as cache poisoning or resource exhaustion
- supply-chain concerns in dependencies

Out of scope: the third-party data sources themselves (report those to the source), and any future onchain components, which will carry their own audited disclosure policy when they ship.

## Secrets

If you believe a secret has been committed or exposed, treat it as urgent and email us immediately. All operational keys are rotatable; a fast report lets us rotate before any impact.

## Safe harbour

We will not pursue or support legal action against anyone who reports a vulnerability in good faith, avoids privacy violations and service disruption, and gives us reasonable time to respond before public disclosure.
