import { describe, expect, it } from "vitest";

import socialMeta, { injectSocialMetadata, metadataForPath } from "../edge-functions/social-meta";

describe("social link metadata", () => {
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

  it("canonicalizes alternate hosts and tracking URLs without changing the response status", async () => {
    const response = await socialMeta(
      new Request("https://www.atomicpuzzles.org/rankings/?utm_source=share"),
      {
        next: () =>
          Promise.resolve(
            new Response("<html><head></head><body>Rankings</body></html>", {
              headers: { "Content-Type": "text/html", "Content-Length": "64" },
            }),
          ),
      },
    );
    const html = await response.text();
    expect(html).toContain('rel="canonical" href="https://atomicpuzzles.org/rankings"');
    expect(html).not.toContain("utm_source");
    expect(response.headers.has("Content-Length")).toBe(false);
    expect(response.status).toBe(200);
  });

  it("keeps the static guide canonical pointed at the served directory URL", async () => {
    const response = await socialMeta(
      new Request("https://atomicpuzzles.org/atomic-chess/?utm_source=share"),
      {
        next: () =>
          Promise.resolve(
            new Response(
              '<html><head><link rel="canonical" href="https://atomicpuzzles.org/atomic-chess/" /></head></html>',
              { headers: { "Content-Type": "text/html" } },
            ),
          ),
      },
    );
    const html = await response.text();
    expect(html.match(/rel="canonical" href="[^"]+"/g)).toEqual([
      'rel="canonical" href="https://atomicpuzzles.org/atomic-chess/"',
    ]);
  });

  it("consolidates shared analysis positions under the same canonical as the rendered board", async () => {
    const response = await socialMeta(
      new Request("https://atomicpuzzles.org/analysis/8/8/8/8/8/8/8/K6k_w_-_-_0_1"),
      {
        next: () =>
          Promise.resolve(
            new Response("<html><head></head></html>", {
              headers: { "Content-Type": "text/html" },
            }),
          ),
      },
    );
    expect(await response.text()).toContain(
      'rel="canonical" href="https://atomicpuzzles.org/analysis"',
    );
  });

  it("does not index the standalone SPA shell or rewrite a hosting redirect", async () => {
    const context = {
      next: () =>
        Promise.resolve(
          new Response("<html><head></head></html>", {
            headers: { "Content-Type": "text/html" },
          }),
        ),
    };
    const shell = await socialMeta(new Request("https://atomicpuzzles.org/app.html"), context);
    expect(await shell.text()).toContain('<meta name="robots" content="noindex"');

    const redirect = new Response("<html><head></head></html>", {
      status: 301,
      headers: { "Content-Type": "text/html", Location: "/recent" },
    });
    const response = await socialMeta(new Request("https://atomicpuzzles.org/matches"), {
      next: () => Promise.resolve(redirect),
    });
    expect(response).toBe(redirect);
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
