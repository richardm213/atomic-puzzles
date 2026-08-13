import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures";

const accessiblePages = [
  { path: "/", name: "home" },
  { path: "/h2h", name: "head-to-head search" },
  { path: "/tournaments", name: "tournament archive" },
  { path: "/solve/101", name: "puzzle solver" },
] as const;

for (const appPage of accessiblePages) {
  test(`${appPage.name} has no serious automated accessibility violations`, async ({ page }) => {
    await page.goto(appPage.path);
    await expect(page.getByRole("main")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include("#main-content")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const seriousViolations = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );

    expect(seriousViolations).toEqual([]);
  });
}
