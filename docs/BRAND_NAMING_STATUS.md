# Brand Naming Status

## Current Architecture

- Company: Ghost AI Solutions
- Product: Ghost Lead Command
- AI Director: Vega
- Public URL: https://leadgen.ghostai.solutions
- Onboarding URL: `/onboarding/ai`

## Attribution Language

Primary product attribution:

`A product of Ghost AI Solutions`

Legal/public footer attribution:

`Ghost Lead Command is a product of Ghost AI Solutions. Vega is the AI Sales Director within Ghost Lead Command.`

## Boundaries

- Do not rename the repository or deployment domain as part of Vega branding.
- Do not position Vega as the company.
- Do not add trademark or registered-mark claims.
- Use `src/config/brand.ts` for product, company, URL, support, metadata, and attribution copy.

## Future Rename Path

If Ghost Lead Command, Vega, or the company attribution changes, update `src/config/brand.ts` first and then run tests. Public homepage, onboarding metadata, footer, and public components should inherit the change from the shared config.
