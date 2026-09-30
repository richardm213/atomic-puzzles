import type { SVGProps } from "react";

export const NadekoFlowersIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <g id="nadeko-blossom">
        {[0, 72, 144, 216, 288].map((rotation) => (
          <path
            key={rotation}
            d="M0 1.5C-5.6-1.4-8.2-5.7-6.4-9.2C-4.8-12.3-1.9-11.8 0-8.5C1.9-11.8 4.8-12.3 6.4-9.2C8.2-5.7 5.6-1.4 0 1.5Z"
            fill="#FF9ACA"
            stroke="#8A3D68"
            strokeWidth="0.8"
            strokeLinejoin="round"
            transform={`rotate(${rotation})`}
          />
        ))}
        <circle r="2.4" fill="#FFD65A" stroke="#9C6233" strokeWidth="0.7" />
        <circle r="0.8" fill="#FFF3AD" />
      </g>
    </defs>

    <path
      d="M15 43C27 35 37 28 50 17M27 50C31 40 39 34 51 31"
      stroke="#6E9B72"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path d="M22 40C16 35 12 36 11 41C15 44 19 44 22 40Z" fill="#82B989" />
    <path d="M40 31C45 25 50 26 51 30C48 34 44 35 40 31Z" fill="#82B989" />

    <g transform="translate(15 18) scale(.72)">
      <use href="#nadeko-blossom" />
    </g>
    <g transform="translate(32 14) scale(.84)">
      <use href="#nadeko-blossom" />
    </g>
    <g transform="translate(49 19) scale(.68)">
      <use href="#nadeko-blossom" />
    </g>
    <g transform="translate(20 36) scale(.82)">
      <use href="#nadeko-blossom" />
    </g>
    <g transform="translate(39 34) scale(1.02)">
      <use href="#nadeko-blossom" />
    </g>
    <g transform="translate(31 50) scale(.63)">
      <use href="#nadeko-blossom" />
    </g>
  </svg>
);
