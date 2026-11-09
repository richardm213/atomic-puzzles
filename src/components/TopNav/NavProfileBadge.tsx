import { faUser } from "@fortawesome/free-solid-svg-icons";

import { NavCircleBadge } from "./NavCircleBadge";

const path = faUser.icon[4];

export const NavProfileBadge = () => (
  <NavCircleBadge className="navProfileBadge">
    {/* The user path occupies x=16..432, y=8..512; frame the ink itself. */}
    <svg viewBox="16 8 416 504" focusable="false" aria-hidden="true">
      {(Array.isArray(path) ? path : [path]).map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  </NavCircleBadge>
);
