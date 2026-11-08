import { type CSSProperties, useId } from "react";

import type { ColorMode } from "../../context/AppSettings";
import { appAssetPath } from "../../utils/appAssetPath";

export const NavBrandMark = ({ mode, tinted }: { mode: ColorMode; tinted: boolean }) => {
  const filterId = useId();
  const isLight = mode === "light";
  // Map the original tile and nucleus luminances to the palette's two inks.
  // A gentle gamma lift keeps the fine orbit strokes vivid against the muted tile.
  const slope = isLight ? -1.62 : 1.51;
  const intercept = isLight ? 1.6 : -0.344;

  return (
    <>
      {tinted ? (
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
                <feFuncA type="linear" slope={slope} intercept={intercept} />
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
      ) : null}
      <img
        className="brandMarkImage"
        src={appAssetPath(`/images/brand/atomic-logo-${mode}.png`)}
        alt=""
        width="30"
        height="30"
        aria-hidden="true"
        style={
          tinted ? ({ "--brand-mark-filter": `url("#${filterId}")` } as CSSProperties) : undefined
        }
      />
    </>
  );
};
