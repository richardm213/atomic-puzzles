import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { injectSocialMetadata, metadataForPath } from "../netlify/edge-functions/social-meta.ts";
import {
  ATOMIC_CHESS_PATH,
  ATOMIC_CHESS_STRUCTURED_DATA,
  canonicalUrlForPath,
  HOME_STRUCTURED_DATA,
  TACTICAL_MOTIFS_PATH,
} from "../shared/seo.ts";
import { AtomicChessGuideContent } from "../src/pages/AtomicChess/AtomicChessGuideContent.tsx";
import { HomeHeroLead } from "../src/pages/Home/HomeHeroLead.tsx";
import { HomeShortcuts } from "../src/pages/Home/HomeShortcuts.tsx";
import { PuzzleMotifsContent } from "../src/pages/PuzzleMotifs/PuzzleMotifsContent.tsx";

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
        const tags = styles.map((href) => `<link rel="stylesheet" href="/${href}" />`);
        if (structuredData) {
          const jsonLd = JSON.stringify(structuredData).replaceAll("<", "\\u003c");
          tags.push(
            `<script type="application/ld+json" data-seo-json-ld="true">${jsonLd}</script>`,
          );
        }
        return injectSocialMetadata(shell, metadataForPath(path), canonicalUrlForPath(path))
          .replace('<div id="root"></div>', `<div id="root">${renderToStaticMarkup(content)}</div>`)
          .replace("</head>", `${tags.join("\n")}\n</head>`);
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
      const emitDirectoryPage = (path, routeModule, className, Content, structuredData) => {
        const chunk = Object.values(bundle).find(
          (file) => file.type === "chunk" && file.facadeModuleId?.endsWith(routeModule),
        );
        // Shared route styles may live on a dependency rather than the route chunk.
        const visited = new Set();
        const styles = new Set();
        const collectStyles = (file) => {
          if (file?.type !== "chunk" || visited.has(file.fileName)) return;
          visited.add(file.fileName);
          for (const dependency of file.imports) collectStyles(bundle[dependency]);
          for (const href of file.viteMetadata?.importedCss ?? []) {
            if (!shell.includes(`href="/${href}"`)) styles.add(href);
          }
        };
        collectStyles(chunk);
        if (!styles.size) throw new Error(`Static page stylesheet is missing for ${path}`);
        this.emitFile({
          type: "asset",
          fileName: `${path.slice(1)}index.html`,
          source: renderPage(
            path,
            createElement("main", { className }, createElement(Content)),
            structuredData,
            [...styles],
          ),
        });
      };
      emitDirectoryPage(
        ATOMIC_CHESS_PATH,
        "/AtomicChess/AtomicChess.tsx",
        "page atomicChessPage",
        AtomicChessGuideContent,
        ATOMIC_CHESS_STRUCTURED_DATA,
      );
      emitDirectoryPage(
        TACTICAL_MOTIFS_PATH,
        "/PuzzleMotifs/PuzzleMotifs.tsx",
        "motifsPage",
        PuzzleMotifsContent,
      );
    },
  },
});
