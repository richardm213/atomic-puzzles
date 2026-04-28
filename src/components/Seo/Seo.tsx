import { useEffect } from "react";
import type { StructuredData } from "../../types/seo";

const SITE_NAME = "Atomic Puzzles";
const DEFAULT_DESCRIPTION =
  "Atomic chess puzzles, rankings, recent matches, and player profiles for the Lichess atomic scene.";
const DEFAULT_ROBOTS = "index,follow";

export type SeoProps = {
  title?: string;
  description?: string;
  path?: string;
  robots?: string;
  type?: string;
  structuredData?: StructuredData;
};

const absoluteUrl = (path: string): string => {
  if (typeof window === "undefined") return path;

  try {
    return new window.URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
};

const ensureMetaTag = (attributeName: string, attributeValue: string): HTMLMetaElement => {
  const selector = `meta[${attributeName}="${attributeValue}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }

  return element;
};

const ensureLinkTag = (relValue: string): HTMLLinkElement => {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${relValue}"]`);

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", relValue);
    document.head.appendChild(element);
  }

  return element;
};

const ensureJsonLdScript = (): HTMLScriptElement => {
  let element = document.head.querySelector<HTMLScriptElement>(
    'script[data-seo-json-ld="true"]',
  );

  if (!element) {
    element = document.createElement("script");
    element.type = "application/ld+json";
    element.setAttribute("data-seo-json-ld", "true");
    document.head.appendChild(element);
  }

  return element;
};

export const Seo = ({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  robots = DEFAULT_ROBOTS,
  type = "website",
  structuredData,
}: SeoProps) => {
  useEffect(() => {
    const pageTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    const canonicalUrl = absoluteUrl(path);
    const ogImageUrl = absoluteUrl("/favicon.ico");

    document.title = pageTitle;
    document.documentElement.lang = "en";

    ensureMetaTag("name", "description").setAttribute("content", description);
    ensureMetaTag("name", "robots").setAttribute("content", robots);
    ensureMetaTag("property", "og:site_name").setAttribute("content", SITE_NAME);
    ensureMetaTag("property", "og:title").setAttribute("content", pageTitle);
    ensureMetaTag("property", "og:description").setAttribute("content", description);
    ensureMetaTag("property", "og:type").setAttribute("content", type);
    ensureMetaTag("property", "og:url").setAttribute("content", canonicalUrl);
    ensureMetaTag("property", "og:image").setAttribute("content", ogImageUrl);
    ensureMetaTag("name", "twitter:card").setAttribute("content", "summary");
    ensureMetaTag("name", "twitter:title").setAttribute("content", pageTitle);
    ensureMetaTag("name", "twitter:description").setAttribute("content", description);
    ensureLinkTag("canonical").setAttribute("href", canonicalUrl);

    const jsonLdScript = ensureJsonLdScript();
    jsonLdScript.textContent = structuredData ? JSON.stringify(structuredData) : "";
  }, [description, path, robots, structuredData, title, type]);

  return null;
};
