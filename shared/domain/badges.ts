export type BadgeCategory =
  "attempted" | "correct" | "created" | "blitz" | "bullet" | "hyperbullet";

export type BadgeTier = "meteorite" | "moon" | "planet" | "sun" | "eclipse" | "nova" | "black_hole";

export type BadgeTierDefinition = {
  key: BadgeTier;
  name: string;
  rank: number;
  description: string;
};

export type BadgeDefinition = {
  key: string;
  category: BadgeCategory;
  threshold: number;
  name: string;
  description: string;
  tier: BadgeTier;
  tierName: string;
  tierLevel: number;
  iconKey: BadgeCategory;
};

export const badgeCategoryLabels: Record<BadgeCategory, string> = {
  attempted: "Attempted",
  correct: "Solved",
  created: "Created",
  blitz: "Atomic Blitz",
  bullet: "Atomic Bullet",
  hyperbullet: "Atomic Hyper",
};
