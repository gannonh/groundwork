# 2. Use shadcn/ui and Tailwind for standard controls

Date: 2026-09-24. Status: accepted.

## Context

The prototype in `prototypes/opportunity-map/` sets the look: dense cards, a neutral palette, and a small set of color tokens. It uses plain CSS and native inputs. The alpha also needs sheets, menus, popovers, dialogs, and toasts. Those need focus traps, keyboard handling, and screen reader support, which are slow to build well by hand.

shadcn/ui copies component source into the repo instead of installing a library. The repo owns every component and can restyle it. Its theming runs on CSS variables. It requires Tailwind.

## Decision

- Use shadcn/ui for standard controls: button, checkbox, slider, toggle group, dialog, sheet, dropdown menu, popover, tooltip, and toast.
- Map the prototype's tokens onto shadcn's theme variables in `src/styles/app.css`, so stock components match the prototype without per-component overrides.
- Keep the pieces that carry the product's look as custom components: rank cards, score bars, sparklines, trend bars, and quotes.
- Adopt Tailwind for all styling.

## Consequences

- Accessible controls come for free, and dark mode is a second set of variables.
- Visual drift from the prototype is the main risk. Every screen-changing PR is checked against prototype D.
- Components live in `src/components/ui/`. Update them by re-running the shadcn CLI and reviewing the diff, not by editing upstream.
