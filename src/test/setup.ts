import "@testing-library/jest-dom/vitest";

// jsdom has DOM selection but no layout. Editors still need the geometry APIs.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Object.defineProperties(Range.prototype, {
    getClientRects: { value: () => [] },
    getBoundingClientRect: { value: () => new DOMRect() },
  });
}
if (typeof document !== "undefined" && !document.elementFromPoint) {
  Object.defineProperty(document, "elementFromPoint", { value: () => null });
}
