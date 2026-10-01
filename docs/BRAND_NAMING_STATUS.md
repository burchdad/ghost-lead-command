# Brand Naming Status

## Current Architecture

- Company: Ghost AI Solutions
- Product: Ghost Lead Command
- AI Director: Ghost Director
- Public URL: https://leadgen.ghostai.solutions
- Onboarding URL: `/onboarding/ai`

## Attribution Language

Primary product attribution:

`A product of Ghost AI Solutions`

Legal/public footer attribution:

`Ghost Lead Command is a product of Ghost AI Solutions. Ghost Director is the AI Sales Director within Ghost Lead Command.`

## Boundaries

- Do not rename the repository or deployment domain as part of Ghost Director branding.
- Do not position Ghost Director as the company.
- Do not add trademark or registered-mark claims.
- Use `src/config/brand.ts` for product, company, URL, support, metadata, and attribution copy.
- Ghost Director Discover, Ghost Director Signal, Ghost Director Reach, Ghost Director Engage, Ghost Director Convert, and Ghost Director Intelligence are capability groups inside Ghost Lead Command, not legal entities or separate product brands.

## Future Rename Path

If Ghost Lead Command, Ghost Director, or the company attribution changes, update `src/config/brand.ts` first and then run tests. Public homepage, onboarding metadata, footer, and public components should inherit the change from the shared config.

## October 1, 2026 update

Public director identity is Ghost Director. Plan names are Scout, Reach, Convert, and Managed. Legacy VEGA_* database enums, API keys, asset paths, and persisted product codes are intentionally preserved. New prices live in src/config/service-plans.ts; existing accepted quotes and subscriptions are not repriced.
