import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Seo } from "../../components/Seo/Seo";
import { RatingHistoryGraph } from "../../features/profile/RatingHistoryGraph";
import { profileAliasQueryOptions } from "../../lib/users/aliasQueries";
import { normalizeUsername } from "../../utils/playerNames";

export const RatingHistoryPage = ({ username }: { username: string }) => {
  const normalized = normalizeUsername(username);
  const aliases = useQuery(profileAliasQueryOptions(normalized));
  const canonical = aliases.data?.username ?? normalized;
  return (
    <div className="rankingsPage">
      <Seo
        title={`${canonical} · Rating history`}
        description={`Monthly leaderboard rating history for ${canonical}.`}
        path={`/@/${encodeURIComponent(canonical)}/ratings`}
      />
      <div className="panel rankingsPanel ratingHistoryPage">
        <header className="ratingPageHeader">
          <h1>Rating history</h1>
          <Link to="/@/$username" params={{ username: canonical }} className="ratingProfileLink">
            ← {username}
          </Link>
        </header>
        {aliases.isPending ? (
          <p role="status">Loading player…</p>
        ) : aliases.isError ? (
          <div role="alert">
            <p>Could not load player.</p>
            <button type="button" onClick={() => void aliases.refetch()}>
              Retry
            </button>
          </div>
        ) : aliases.data?.banned ? (
          <p>This player is not included in Atomic Puzzles ratings.</p>
        ) : (
          <RatingHistoryGraph key={canonical} username={canonical} />
        )}
      </div>
    </div>
  );
};
