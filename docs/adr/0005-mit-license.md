# 5. License the core under MIT

Date: 2026-09-24. Status: accepted.

## Context

The PRD planned an AGPL-3.0 core with a contributor license agreement, so the project could sell commercial licenses and deter competitors from hosting modified copies. The PRD also listed "AGPL core, or MIT core" as an open question.

AGPL's network clause makes anyone who runs a modified Groundwork as a service publish their changes to its users. Gannon's view is that this obligation is no real advantage for Groundwork. It does add friction. Some companies ban AGPL outright, which blocks self-hosting in exactly the engineering-led teams Groundwork targets. It also deters some contributors, and dual licensing would need a CLA on every contribution.

## Decision

- The core ships under MIT. `LICENSE` holds the text.
- No contributor license agreement. Contributions come in under MIT.

## Consequences

- Self-hosting and contributing carry no license friction.
- Anyone may run Groundwork as a hosted product, including a competitor, and keep their changes private. The hosted cloud competes on running the product well, not on license terms.
- Selling a commercial license for the core is off the table. Code released under MIT stays MIT.
- CodeRabbit's free open source plan is unaffected. It only requires a public repo.
