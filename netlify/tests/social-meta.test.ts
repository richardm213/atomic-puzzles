import { describe, expect, it } from "vitest";

import { injectSocialMetadata, metadataForPath } from "../edge-functions/social-meta";

describe("social link metadata", () => {
  it("keeps the marketing description exclusive to the homepage", () => {
    const home = metadataForPath("/");
    const profile = metadataForPath("/@/sircachetes");
    const unknown = metadataForPath("/other-page");
    const privatePage = metadataForPath("/admin/coin-bans");

    expect(home.description).toContain("Solve atomic chess puzzles");
    expect(profile).toEqual({
      title: "sircachetes — Atomic Chess Profile",
      description: "View sircachetes' atomic chess ratings, rankings, aliases, and recent matches.",
    });
    expect(unknown).toEqual({ title: "Atomic Puzzles" });
    expect(privatePage).toEqual({ title: "Atomic Puzzles", robots: "noindex,nofollow" });
  });

  it("creates puzzle-specific metadata without revealing the solution", () => {
    expect(metadataForPath("/solve/2345")).toEqual({
      title: "Atomic Puzzle #2345",
      description: "Solve atomic chess puzzle #2345.",
    });
    expect(metadataForPath("/solve/set/awc2026/2345").title).toBe("Atomic Puzzle #2345");
  });

  it("identifies the player in shared practice links", () => {
    expect(metadataForPath("/practice/HowlinD")).toEqual({
      title: "Practice against HowlinD",
      description: "Practice atomic openings against games played by HowlinD.",
    });
  });

  it("replaces the static homepage tags instead of duplicating them", () => {
    const source = `<!doctype html><html><head>
      <meta name="description" content="Homepage copy" />
      <meta property="og:title" content="Homepage" />
      <meta property="og:description" content="Homepage copy" />
      <title>Homepage</title>
    </head><body></body></html>`;
    const result = injectSocialMetadata(
      source,
      metadataForPath("/@/sircachetes"),
      "https://atomicpuzzles.org/@/sircachetes",
    );

    expect(result).not.toContain("Homepage copy");
    expect(result).toContain("sircachetes — Atomic Chess Profile");
    expect(result.match(/property="og:title"/g)).toHaveLength(1);
    expect(result).toContain('property="og:url" content="https://atomicpuzzles.org/@/sircachetes"');
  });
});
