export type NavItem = {
  to: string;
  label: string;
  isActive: (pathname: string) => boolean;
  hideInCompactNav?: boolean;
  linkToPage?: boolean;
  children?: {
    to: string;
    label: string;
    isActive: (pathname: string) => boolean;
  }[];
};

export const navItems: NavItem[] = [
  {
    to: "/rankings",
    label: "Rankings",
    isActive: (pathname) => pathname === "/rankings" || pathname.startsWith("/rankings/"),
    children: [
      {
        to: "/rankings",
        label: "Monthly rankings",
        isActive: (pathname) => pathname === "/rankings",
      },
      {
        to: "/rankings/yearly",
        label: "Yearly rankings",
        isActive: (pathname) => pathname === "/rankings/yearly",
      },
      {
        to: "/rankings/puzzles",
        label: "Puzzle rankings",
        isActive: (pathname) => pathname === "/rankings/puzzles",
      },
      {
        to: "/rankings/openings",
        label: "Opening rankings",
        isActive: (pathname) => pathname === "/rankings/openings",
      },
    ],
  },
  {
    to: "/solve",
    label: "Puzzles",
    isActive: (pathname) =>
      pathname === "/solve" ||
      pathname.startsWith("/solve/") ||
      pathname.startsWith("/puzzles/") ||
      pathname === "/dashboard",
    children: [
      {
        to: "/solve",
        label: "Solve puzzles",
        isActive: (pathname) =>
          pathname === "/solve" ||
          (/^\/solve\/[^/]+$/.test(pathname) &&
            pathname !== "/solve/sets" &&
            pathname !== "/solve/custom-sets" &&
            pathname !== "/solve/leaderboard" &&
            pathname !== "/solve/history"),
      },
      {
        to: "/dashboard",
        label: "Puzzle dashboard",
        isActive: (pathname) => pathname === "/dashboard" || pathname === "/solve/history",
      },
      {
        to: "/solve/sets",
        label: "Puzzle sets",
        isActive: (pathname) => pathname === "/solve/sets",
      },
      {
        to: "/solve/custom-sets",
        label: "Custom sets",
        isActive: (pathname) => pathname === "/solve/custom-sets",
      },
      {
        to: "/puzzles/motifs",
        label: "Tactical motifs",
        isActive: (pathname) => pathname === "/puzzles/motifs",
      },
      {
        to: "/puzzles/submit",
        label: "Submit puzzles",
        isActive: (pathname) => pathname === "/puzzles/submit",
      },
    ],
  },
  {
    to: "/recent",
    label: "Games",
    isActive: (pathname) =>
      pathname === "/recent" ||
      pathname === "/matches" ||
      pathname.startsWith("/matches/") ||
      pathname === "/h2h" ||
      pathname.startsWith("/h2h/"),
    children: [
      {
        to: "/recent",
        label: "Recent games",
        isActive: (pathname) =>
          pathname === "/recent" || pathname === "/matches" || pathname.startsWith("/matches/"),
      },
      {
        to: "/h2h",
        label: "H2H",
        isActive: (pathname) => pathname === "/h2h" || pathname.startsWith("/h2h/"),
      },
    ],
  },
  {
    to: "/tournaments",
    label: "Tournaments",
    isActive: (pathname) =>
      pathname === "/tournaments" ||
      pathname.startsWith("/tournaments/") ||
      pathname === "/arenas" ||
      pathname === "/calendar",
    children: [
      {
        to: "/tournaments",
        label: "Tournament archive",
        isActive: (pathname) => pathname === "/tournaments" || pathname.startsWith("/tournaments/"),
      },
      {
        to: "/arenas",
        label: "Arena archive",
        isActive: (pathname) => pathname === "/arenas",
      },
      {
        to: "/calendar",
        label: "Arena calendar",
        isActive: (pathname) => pathname === "/calendar",
      },
    ],
  },
  {
    to: "/community",
    label: "Community",
    hideInCompactNav: true,
    isActive: (pathname) =>
      pathname.startsWith("/community/") ||
      pathname === "/comments" ||
      pathname === "/shop" ||
      pathname.startsWith("/shop/") ||
      pathname === "/users" ||
      pathname.startsWith("/users/"),
    children: [
      {
        to: "/users",
        label: "Players",
        isActive: (pathname) => pathname === "/users" || pathname.startsWith("/users/"),
      },
      {
        to: "/community/puzzles",
        label: "Puzzle votes",
        isActive: (pathname) => pathname === "/community/puzzles",
      },
      {
        to: "/community/users",
        label: "User activity",
        isActive: (pathname) => pathname === "/community/users",
      },
      {
        to: "/comments",
        label: "Comments",
        isActive: (pathname) => pathname === "/comments",
      },
      {
        to: "/shop",
        label: "Shop",
        isActive: (pathname) => pathname === "/shop" || pathname.startsWith("/shop/"),
      },
    ],
  },
  {
    to: "/analysis",
    label: "Analysis",
    hideInCompactNav: true,
    isActive: (pathname) => pathname === "/analysis" || pathname === "/practice",
    children: [
      {
        to: "/analysis",
        label: "Analysis board",
        isActive: (pathname) => pathname === "/analysis",
      },
      {
        to: "/practice",
        label: "Practice",
        isActive: (pathname) => pathname === "/practice",
      },
    ],
  },
];
