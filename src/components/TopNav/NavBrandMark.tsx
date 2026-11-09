import { type CSSProperties, useId } from "react";

import { appAssetPath } from "../../utils/appAssetPath";

export const NavBrandMark = () => {
  const filterId = useId();
  // All palettes and modes share the same artwork and alpha mask, so changing
  // appearance only recolors the logo without changing its visible footprint.

  return (
    <>
      <svg className="brandMarkFilter" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="1.51" intercept="-0.344" />
            </feComponentTransfer>
            <feComponentTransfer result="tone">
              <feFuncA type="gamma" amplitude="1" exponent="0.88" offset="0" />
            </feComponentTransfer>
            <feFlood className="brandMarkFilterInk" result="ink" />
            <feComposite in="ink" in2="tone" operator="in" result="shadedInk" />
            <feFlood className="brandMarkFilterTile" result="tile" />
            <feComposite in="shadedInk" in2="tile" operator="over" result="tintedMark" />
            <feComposite in="tintedMark" in2="SourceAlpha" operator="in" />
          </filter>
        </defs>
      </svg>
      <img
        className="brandMarkImage"
        src={appAssetPath("/images/brand/atomic-logo-dark.png")}
        alt=""
        width="30"
        height="30"
        aria-hidden="true"
        style={{ "--brand-mark-filter": `url("#${filterId}")` } as CSSProperties}
      />
    </>
  );
};
