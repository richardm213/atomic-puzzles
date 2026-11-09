import { faUser } from "@fortawesome/free-solid-svg-icons";
import { useLayoutEffect, useRef } from "react";

const [width, height, , , path] = faUser.icon;
const scale = 14 / Math.max(width, height);
const x = (32 - width * scale) / 2;
const y = (32 - height * scale) / 2;

export const NavProfileBadge = () => {
  const glyphRef = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const glyph = glyphRef.current;
    if (!glyph) return;
    const box = glyph.getBBox();
    const glyphScale = 14 / Math.max(box.width, box.height);
    glyph.setAttribute(
      "transform",
      `translate(16 16) scale(${glyphScale}) translate(${-box.x - box.width / 2} ${-box.y - box.height / 2})`,
    );
  }, []);

  return (
    <svg className="navAuthProfileIcon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="16" fill="var(--profile-icon-fill)" />
      {/* Paint both shapes in one coordinate system, independent of font metrics and theme. */}
      <g ref={glyphRef} transform={`translate(${x} ${y}) scale(${scale})`} fill="currentColor">
        {(Array.isArray(path) ? path : [path]).map((d, index) => (
          <path key={index} d={d} />
        ))}
      </g>
    </svg>
  );
};
