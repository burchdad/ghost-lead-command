# Vega Design System

Vega is the AI Sales Director inside Ghost Lead Command, a product of Ghost AI Solutions.

## Brand Roles

- Ghost AI Solutions is the company.
- Ghost Lead Command is the product.
- Vega is the AI Sales Director within the product.

## Color Semantics

- Purple is Vega intelligence and decision support.
- Lime is success, readiness, and primary conversion moments.
- Teal is data, research, and source intelligence.
- Amber is review, caution, and approval wait states.
- Red is danger, failed sends, suppression, or blocked actions.

The shared tokens live in `src/app/globals.css`. Product naming and attribution live in `src/config/brand.ts`.

## Asset Registry

Approved Vega artwork is registered in `src/config/vega-assets.ts`. The current approved source is `public/vega-avatar.png`.
State-specific slots fall back to the approved neutral artwork until final art is exported.

## Components

The public Vega kit lives in `src/components/vega`.

- `VegaAvatar` renders approved Vega artwork through the registry.
- `VegaIdentity` shows Vega, AI Sales Director, and Ghost Lead Command.
- `VegaDirectorPanel` presents Vega and the coordinated sub-agent lanes.
- `VegaMessageBubble` distinguishes Vega and customer messages without relying only on color.
- `VegaPlanCard` standardizes the Scout, Reach, Convert, and Managed offer cards.
- `GhostProductAttribution` and `PoweredByGhost` keep Ghost AI Solutions attribution consistent.

## Usage Rules

Use Vega identity on public and onboarding surfaces. Do not decorate every internal operator screen with public-brand flourishes.
Keep "Online" and "Ready" labels for real configured state, and avoid fake live-status claims in public preview panels.
