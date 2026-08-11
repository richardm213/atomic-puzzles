# UI Design Protocol

This is the durable design playbook for Atomic Puzzles. Apply it to meaningful UI design,
redesign, and component work. Small, explicit fixes do not require a discovery round, but they
still follow the content, consistency, accessibility, and verification rules below.

## Role and standard

Design first; use code to realize the design. A successful change clarifies purpose, improves
hierarchy, respects the product's existing visual language, and earns every visible element. Do
not produce generic template styling or add elements merely to make a screen feel more designed.

The user is the manager. Exercise design judgment, but defer to their knowledge of the product,
audience, and priorities.

## Start with existing context

Before changing a page:

1. Read the page component and its styles.
2. Read the shared theme tokens and relevant shared components.
3. Inspect adjacent pages that establish the same pattern.
4. Preserve established content widths, density, typography, controls, radii, shadows, and copy
   tone unless there is a concrete usability reason to change them.
5. Prefer adapting an existing component or interaction pattern over inventing a new one.

Do not redesign from memory. Use the exact values and patterns in the repository.

## Content: no filler

Every element must answer a real user question, advance the task, or provide necessary structure.
Otherwise, remove it.

Hard rules:

- Never add eyebrow labels or mini-titles above page headings.
- Never add generic subtitles that restate a heading or controls already visible on the page.
- Do not invent statistics, testimonials, feature claims, placeholder copy, or unnecessary sections.
- Do not add duplicate actions, decorative icons that repeat nearby text, or links without a real
  destination.
- Do not solve empty space by inventing content. Solve it through composition and spacing.
- Ask before adding new sections, new product copy, or scope beyond the request.

For every proposed element, ask:

1. Does it answer something the user needs to know?
2. Would the page remain equally understandable without it?
3. Is there a shorter or more direct expression?
4. Does it serve the user or merely advertise the design?

If the page remains equally understandable without the element, remove it.

## Visual direction

- Follow the existing cool/neutral product palette and shared theme tokens.
- Use the repository spacing, radius, type, and shadow scales instead of arbitrary values.
- Default to flat color. Use gradients only when already established or functionally helpful.
- Avoid decorative emoji, gratuitous glass effects, excessive cards, and template-like callouts.
- Use subtle borders, background contrast, and restrained shadows to separate content.
- Use established icon libraries for functional icons. Do not create weak illustrative SVGs.
- Preserve a strong size and weight difference between headings, body text, labels, and metadata.
- Use one clear primary action per screen; keep secondary actions visually subordinate.

## Responsive behavior

- Desktop body text should remain within the established 14–16px range.
- Mobile body text should be at least 16px where sustained reading is required.
- Interactive targets must be at least 44×44px on mobile.
- Do not widen an established desktop page merely because space is available.
- Do not force desktop tables or toolbars onto mobile. Recompose them while preserving semantics.
- Test at a representative desktop width and at approximately 390px wide.

## Accessibility

- Use semantic HTML: buttons for actions, links for navigation, labels for fields, and ordered
  headings.
- Maintain visible keyboard focus and a logical tab order.
- Provide default, hover, active, focus, disabled, loading, error, and success feedback wherever
  those states apply.
- Do not communicate state through color alone.
- Meet WCAG contrast requirements: 4.5:1 for normal text and 3:1 for large text and UI controls.
- Respect `prefers-reduced-motion` and avoid unnecessary motion.
- Use ARIA only when native semantics are insufficient.

## Interaction and state

- Preserve existing URL, local storage, and navigation behavior unless the task changes it.
- Every interaction must give immediate, understandable feedback.
- Current selections and sort states must be visible and programmatically exposed.
- Prefer existing control patterns. A novel control must solve a demonstrated usability problem,
  not just look newer.

## Workflow

For new or ambiguous design work:

1. Establish the audience, goal, constraints, fidelity, existing design context, and whether
   variations are wanted.
2. Inspect the real code and tokens.
3. State a short plan for multi-step work.
4. Build the smallest useful skeleton first.
5. Iterate from feedback rather than polishing an unconfirmed direction.
6. Verify responsive layout, keyboard behavior, interaction states, and the production build.

For a clear follow-up or small correction, skip unnecessary questions and implement directly.

## Delivery checklist

Before finishing:

- Remove redundant copy and decorative filler.
- Confirm spacing follows a consistent scale.
- Confirm new UI matches nearby pages and shared tokens.
- Check focus, hover, active, and disabled states.
- Check desktop and mobile layouts for overflow and clipping.
- Run focused tests, typecheck, lint, and the production build as appropriate.
- Report only caveats, verification failures, and useful next steps. Do not narrate every change.
