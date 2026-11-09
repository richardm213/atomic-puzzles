import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { injectSocialMetadata, metadataForPath } from "../netlify/edge-functions/social-meta.ts";
import { ATOMIC_CHESS_STRUCTURED_DATA, HOME_STRUCTURED_DATA, SITE_URL } from "../shared/seo.ts";
import { AtomicChessGuideContent } from "../src/pages/AtomicChess/AtomicChessGuideContent.tsx";
import { HomeHeroLead } from "../src/pages/Home/HomeHeroLead.tsx";
import { HomeShortcuts } from "../src/pages/Home/HomeShortcuts.tsx";

export const homeSeoPlugin = () => ({
  name: "atomic-public-static-html",
  apply: "build",
  generateBundle: {
    order: "post",
    handler(_options, bundle) {
      const entry = bundle["index.html"];
      if (!entry || entry.type !== "asset" || typeof entry.source !== "string") {
        throw new Error("Homepage HTML is missing from the production build");
      }
      const shell = entry.source;
      if (!shell.includes('<div id="root"></div>')) {
        throw new Error("Page root placeholder changed; static rendering needs updating");
      }
      // Keep homepage content out of all other SPA routes' initial HTML.
      this.emitFile({ type: "asset", fileName: "app.html", source: shell });
      const renderPage = (path, content, structuredData, styles = []) => {
        const jsonLd = JSON.stringify(structuredData).replaceAll("<", "\\u003c");
        const head = styles.map((href) => `<link rel="stylesheet" href="/${href}" />`).join("\n");
        return injectSocialMetadata(shell, metadataForPath(path), `${SITE_URL}${path}`)
          .replace('<div id="root"></div>', `<div id="root">${renderToStaticMarkup(content)}</div>`)
          .replace(
            "</head>",
            `${head}<script type="application/ld+json" data-seo-json-ld="true">${jsonLd}</script>\n</head>`,
          );
      };
      entry.source = renderPage(
        "/",
        createElement(
          "main",
          { className: "homePage" },
          createElement(
            "section",
            { className: "homeHero", "aria-labelledby": "home-title" },
            createElement(HomeHeroLead),
          ),
          createElement(
            "section",
            { className: "homeSpotlightSection", "aria-label": "Atomic chess shortcuts" },
            createElement(
              "div",
              { className: "homeSpotlightGrid" },
              createElement(HomeShortcuts, { group: "primary" }),
              createElement(HomeShortcuts, { group: "secondary" }),
            ),
          ),
        ),
        HOME_STRUCTURED_DATA,
      );
      const guideChunk = Object.values(bundle).find(
        (file) =>
          file.type === "chunk" && file.facadeModuleId?.endsWith("/AtomicChess/AtomicChess.tsx"),
      );
      const guideStyles = [...(guideChunk?.viteMetadata?.importedCss ?? [])];
      if (!guideStyles.length) throw new Error("Atomic chess guide stylesheet is missing");
      this.emitFile({
        type: "asset",
        fileName: "atomic-chess/index.html",
        source: renderPage(
          "/atomic-chess",
          createElement(
            "main",
            { className: "page atomicChessPage" },
            createElement(AtomicChessGuideContent),
          ),
          ATOMIC_CHESS_STRUCTURED_DATA,
          guideStyles,
        ),
      });
    },
  },
});
