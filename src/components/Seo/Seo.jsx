import { useEffect } from "react";

const SITE_NAME = "Atomic Puzzles";
const DEFAULT_DESCRIPTION =
  "Atomic chess puzzles, rankings, recent matches, and player profiles for the Lichess atomic scene.";
const DEFAULT_ROBOTS = "index,follow";

const absoluteUrl = (path) => {
  if (typeof window === "undefined") return path;

  try {
    return new window.URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
};

const ensureMetaTag = (attributeName, attributeValue) => {
  const selector = `meta[${attributeName}="${attributeValue}"]`;
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }

  return element;
};

const ensureLinkTag = (relValue) => {
  let element = document.head.querySelector(`link[rel="${relValue}"]`);

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", relValue);
    document.head.appendChild(element);
  }

  return element;
};

const ensureJsonLdScript = () => {
  let element = document.head.querySelector('script[data-seo-json-ld="true"]');

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
  structuredData = null,
}) => {
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
