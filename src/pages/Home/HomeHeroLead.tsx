import type { ComponentProps, ComponentType } from "react";

export const HomeAnchor = ({ children, ...props }: ComponentProps<"a">) => (
  <a {...props}>{children}</a>
);

// Shared by the interactive homepage and its build-time HTML, so crawlers and visitors
// get the same heading and navigation without needing JavaScript to discover the site.
export const HomeHeroLead = ({
  LinkComponent = HomeAnchor,
}: {
  LinkComponent?: ComponentType<ComponentProps<"a">>;
}) => (
  <div className="homeHeroLead">
    <h1 id="home-title">Atomic chess puzzles, rankings, and matches</h1>
    <p className="homePuzzleCount">
      <strong>2,000+</strong> puzzles available
    </p>
    <div className="homeHeroActions">
      <LinkComponent className="homePrimaryCta" href="/solve">
        Solve puzzles
      </LinkComponent>
      <LinkComponent className="homeSecondaryCta" href="/rankings">
        View rankings
      </LinkComponent>
      <LinkComponent className="homeSecondaryCta" href="/betting">
        Betting
      </LinkComponent>
    </div>
  </div>
);
