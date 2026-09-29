# Testing Protocol

The purpose of this suite is to catch expensive regressions with the least possible maintenance.
Tests are code: every test must justify its runtime, brittleness, and future editing cost.

## The admission test

Before writing a test, answer all four questions:

1. What realistic regression would this catch?
2. Would that regression matter to a user, data integrity, security, or a difficult domain rule?
3. Is the behavior absent from existing coverage?
4. What is the cheapest stable layer that can prove it?

If the answers are unclear, do not add the test. Verify the change manually instead.

## Coverage worth keeping

Prioritize tests for:

- authentication, authorization, CSRF, session, and mutation boundaries;
- database writes, destructive operations, and data-shape normalization;
- atomic-chess rules, PGN parsing, puzzle playback, and bracket advancement;
- concurrency, caching, request ordering, pagination races, and recovery behavior;
- accessibility semantics and keyboard workflows that are easy to regress;
- a bug that occurred in production or could plausibly recur;
- one representative end-to-end path through an important workflow.

## Tests not to write

Do not add tests whose main purpose is to verify:

- exact marketing copy, headings, CSS classes, or incidental DOM structure;
- that hard-coded catalog entries contain the same hard-coded values as the test;
- trivial getters, one-line wrappers, pass-through components, or JavaScript/library behavior;
- every permutation of the same rule when representative boundary cases prove it;
- the same behavior separately on multiple routes, roles, modes, and viewport widths;
- private function calls or implementation details instead of observable outcomes;
- mocked behavior so completely that no application logic remains under test;
- a snapshot that will be approved automatically whenever the UI changes.

Do not add a test solely because a new function, component, branch, or line exists.

## Choose one layer

Use the lowest layer that gives trustworthy coverage:

1. **Pure unit test** for domain transformations, parsers, validation, and branching rules.
2. **Component/integration test** only when browser-visible state or interaction matters.
3. **Playwright test** only for routing, real browser behavior, cross-module workflows, responsive
   behavior, or accessibility that unit tests cannot establish.

Do not repeat the same invariant at all three layers. If a unit test proves the rule, an end-to-end
test should cover only the integration risk around it.

## Scope tests around invariants

- One test should prove one meaningful invariant, not one literal input value.
- Use a small table only when each row represents a distinct branch or important boundary.
- Prefer three representative boundaries over ten nearly identical examples.
- For permissions, test the allowed path and the dangerous denied path. Do not test every role/name
  combination unless their behavior actually differs.
- For responsive behavior, use both desktop and mobile only when the interaction model differs.
- For loading, empty, and error states, test only states with distinct behavior—not every copy variant.

## Browser-test rules

- Use deterministic fixtures and intercepted APIs. Do not depend on live services or mutable
  production data.
- Query by accessible role and stable user-facing name. Avoid CSS selectors unless the selector is
  itself the contract under test.
- Do not assert exact geometry, generated stylesheet order, or transient animation state.
- Do not create viewport matrices. Pick one representative viewport per distinct layout behavior.
- Do not take unconditional screenshots; retain them only on failure through Playwright configuration.
- A smoke suite should sample route archetypes, not open every route in the application.

## Cost control

- Reuse setup and fixtures, but do not build a large abstraction merely to support one test.
- Treat a component test consistently taking more than 500 ms as a prompt to simplify, lower the
  test layer, or remove duplicate rendering.
- Adding more than five tests for one change requires a quick duplication review before finishing.
- When touching a large suite, remove obsolete or overlapping cases in the same change.
- When an intentional product change breaks a test, update or delete the test. Do not weaken it into
  an assertion that can no longer catch its original regression.

## Verification workflow

1. Run the narrowest affected test file while iterating.
2. Run lint on changed test files.
3. Run the full relevant runner before delivery when practical.
4. Report genuine failures; never delete a high-value failing test merely to make the suite green.

The default is a small suite of durable tests. More tests are justified only by more risk—not by more
code.
