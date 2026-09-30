import type { BadgeTier } from "../../../shared/domain/badges";

const sharedProps = {
  viewBox: "0 0 56 56",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
} as const;

export const BadgeTierIcon = ({ tier }: { tier: BadgeTier }) => {
  switch (tier) {
    case "meteorite":
      return (
        <svg {...sharedProps}>
          <path d="M9 13 20 19M5 23l11 2M15 6l10 10" className="tierIconTrail" />
          <path d="m19 19 10-7 12 4 8 11-4 14-12 8-14-5-7-12 7-13Z" className="tierIconBody" />
          <path d="m29 17 4 10-10 5-7-2M33 27l10 1 3 9M23 32l8 13" className="tierIconDetail" />
          <circle cx="37" cy="35" r="3" className="tierIconCrater" />
          <circle cx="27" cy="23" r="2" className="tierIconCrater" />
        </svg>
      );
    case "moon":
      return (
        <svg {...sharedProps}>
          <circle cx="28" cy="28" r="20" className="tierIconBody" />
          <path
            d="M39 11c-11 3-17 12-17 22 0 7 3 12 8 15-13 1-22-8-22-20C8 17 17 8 28 8c4 0 8 1 11 3Z"
            className="tierIconShade"
          />
          <circle cx="34" cy="22" r="3.5" className="tierIconCrater" />
          <circle cx="40" cy="32" r="2" className="tierIconCrater" />
          <path d="M31 40c3 1 7 0 10-2" className="tierIconDetail" />
        </svg>
      );
    case "planet":
      return (
        <svg {...sharedProps}>
          <circle cx="28" cy="28" r="16" className="tierIconBody" />
          <path d="M16 18c5 4 15 6 25 4M14 34c7-1 17 2 23 7" className="tierIconDetail" />
          <path
            d="M6 37c5 5 19 1 31-5 12-5 18-11 16-14-2-2-7-1-12 1M15 32c7-1 17-5 25-10"
            className="tierIconOrbit"
          />
          <circle cx="40" cy="13" r="2" className="tierIconSatellite" />
        </svg>
      );
    case "sun":
      return (
        <svg {...sharedProps}>
          <circle cx="28" cy="28" r="13" className="tierIconBody" />
          <circle cx="28" cy="28" r="8" className="tierIconShade" />
          <path
            d="M28 3v7M28 46v7M3 28h7M46 28h7M10 10l5 5M41 41l5 5M46 10l-5 5M15 41l-5 5"
            className="tierIconRays"
          />
          <path
            d="M18 5l2 6M36 45l2 6M5 38l6-2M45 20l6-2M5 18l6 2M45 36l6 2M18 51l2-6M36 11l2-6"
            className="tierIconMinorRays"
          />
        </svg>
      );
    case "eclipse":
      return (
        <svg {...sharedProps}>
          <circle cx="25" cy="28" r="18" className="tierIconCorona" />
          <path
            d="M8 15 13 17M10 42l5-3M29 6l-1 5M29 50l-1-5M45 14l-5 4M47 40l-6-3"
            className="tierIconRays"
          />
          <circle cx="32" cy="26" r="17" className="tierIconVoid" />
          <path d="M16 15c-5 9-3 19 4 26" className="tierIconHighlight" />
          <circle cx="10" cy="28" r="2" className="tierIconSatellite" />
        </svg>
      );
    case "nova":
      return (
        <svg {...sharedProps}>
          <path
            d="m28 3 5 16 13-9-9 13 16 5-16 5 9 13-13-9-5 16-5-16-13 9 9-13-16-5 16-5-9-13 13 9 5-16Z"
            className="tierIconBurst"
          />
          <path d="m28 13 4 10 11 5-11 5-4 10-4-10-11-5 11-5 4-10Z" className="tierIconBody" />
          <circle cx="28" cy="28" r="5" className="tierIconCore" />
          <circle cx="47" cy="9" r="2" className="tierIconSatellite" />
          <circle cx="8" cy="44" r="1.5" className="tierIconSatellite" />
        </svg>
      );
    case "black_hole":
      return (
        <svg {...sharedProps}>
          <path
            d="M5 31c7-10 19-16 31-14 8 1 13 5 15 9M51 26c-7 10-19 16-31 14-8-1-13-5-15-9"
            className="tierIconOuterOrbit"
          />
          <ellipse cx="28" cy="28" rx="23" ry="9" className="tierIconOrbit" />
          <circle cx="28" cy="28" r="14" className="tierIconCorona" />
          <circle cx="28" cy="28" r="9" className="tierIconVoid" />
          <path d="M11 24c8-4 26-7 35 0M10 34c10 3 27 2 36-3" className="tierIconHighlight" />
        </svg>
      );
  }
};
