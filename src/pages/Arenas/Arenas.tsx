import "./Arenas.css";

import { faCalendarDays, faCrown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { type Arena, arenaHref, arenasQueryOptions, filterArenas } from "../../lib/supabase/arenas";
import { appAssetPath } from "../../utils/appAssetPath";

const frequencies = ["all", "monthly", "shield", "yearly"] as const;
const views = ["results", "cards", "years"] as const;
type View = (typeof views)[number];
const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const readPreferences = () => {
  try {
    return JSON.parse(localStorage.getItem("arena-archive-preferences") || "{}");
  } catch {
    return {};
  }
};

const ArenaEntry = ({ arena }: { arena: Arena }) => {
  return (
    <a
      className={`arenaEntry arenaEntry-${arena.frequency}`}
      href={arenaHref(arena)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${arena.name}, ${dateFormat.format(new Date(arena.starts_at))}, 1st ${arena.winner || "not recorded"}, 2nd ${arena.second_place || "not recorded"}, 3rd ${arena.third_place || "not recorded"}, winner points ${arena.score}, ${arena.players} players. Open on Lichess in a new tab`}
    >
      <div className="arenaIdentity">
        <div className="arenaEmblem" aria-hidden="true">
          {arena.frequency === "shield" ? (
            <img
              src={appAssetPath("/images/arenas/atomic-shield.png")}
              alt=""
              width="64"
              height="64"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <FontAwesomeIcon icon={arena.frequency === "yearly" ? faCrown : faCalendarDays} />
          )}
        </div>
        <strong>{arena.frequency.charAt(0).toUpperCase() + arena.frequency.slice(1)}</strong>
      </div>
      <time dateTime={arena.starts_at}>{dateFormat.format(new Date(arena.starts_at))}</time>
      <div className="arenaWinner">
        {(
          [
            ["1st", arena.winner],
            ["2nd", arena.second_place],
            ["3rd", arena.third_place],
          ] as const
        ).map(([place, player]) => (
          <div className="arenaPlacing" key={place}>
            <span className="arenaPlaceLabel">{place}</span>
            <strong>{player || "—"}</strong>
          </div>
        ))}
      </div>
      <div className="arenaNumber">
        <span className="arenaMobileLabel">Winner points</span>
        {arena.score.toLocaleString()}
      </div>
      <div className="arenaNumber">
        <span className="arenaMobileLabel">Players</span>
        {arena.players.toLocaleString()}
      </div>
      <span className="arenaExternal" aria-hidden="true">
        ↗
      </span>
    </a>
  );
};

export const ArenasPage = () => {
  const [preferences] = useState(readPreferences);
  const [view, setView] = useState<View>(
    views.includes(preferences?.view) ? preferences.view : "results",
  );
  const [frequency, setFrequency] = useState<string>(
    frequencies.includes(preferences?.frequency) ? preferences.frequency : "all",
  );
  const [search, setSearch] = useState(
    typeof preferences?.search === "string" ? preferences.search : "",
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        "arena-archive-preferences",
        JSON.stringify({ view, frequency, search }),
      );
    } catch {
      /* Storage may be disabled. */
    }
  }, [view, frequency, search]);
  const query = useQuery(arenasQueryOptions());
  const arenas = filterArenas(query.data ?? [], frequency, search);
  const years = [...new Set(arenas.map((arena) => arena.starts_at.slice(0, 4)))];
  const list = (entries: Arena[]) => (
    <div className="arenaList">
      {view !== "cards" && (
        <div className="arenaColumns" aria-hidden="true">
          <span>Arena</span>
          <span>Date (UTC)</span>
          <span>Top 3</span>
          <span>Winner points</span>
          <span>Players</span>
          <span></span>
        </div>
      )}
      {entries.map((arena) => (
        <ArenaEntry key={arena.arena_id} arena={arena} />
      ))}
    </div>
  );
  return (
    <div className={`sitePage arenasPage arenasView-${view}`}>
      <Seo
        title="Arena archive"
        description="Results from official Monthly, Shield, and Yearly Lichess Atomic arenas."
        path="/arenas"
      />
      <header className="arenasHeader">
        <h1>Arena archive</h1>
        <label className="arenaViewControl">
          View
          <select
            aria-label="View"
            value={view}
            onChange={(event) => setView(event.target.value as View)}
          >
            {views.map((option) => (
              <option key={option} value={option}>
                {option === "results" ? "Results" : option === "cards" ? "Event cards" : "By year"}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="arenaToolbar">
        <div className="arenaFilters" role="group" aria-label="Arena frequency">
          {frequencies.map((option) => (
            <button
              key={option}
              type="button"
              data-frequency={option}
              aria-pressed={frequency === option}
              onClick={() => setFrequency(option)}
            >
              {option === "all" ? "All" : option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
        <label className="arenaSearch">
          Search
          <input
            type="search"
            placeholder="Tournament or winner"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {query.isPending ? (
        <p role="status">Loading arenas…</p>
      ) : query.isError ? (
        <div role="alert" className="arenaMessage">
          <p>Unable to load the arena archive.</p>
          <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : (
        <>
          <div className="arenaResultsMeta">
            <span role="status">
              {arenas.length} {arenas.length === 1 ? "arena" : "arenas"}
            </span>
            <span>Newest first · Links open in a new tab</span>
          </div>
          {arenas.length === 0 ? (
            <div className="arenaMessage">
              <p>
                {query.data?.length
                  ? "No arenas match your filters."
                  : "No arenas have been added yet."}
              </p>
              {(search || frequency !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFrequency("all");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : view === "years" ? (
            years.map((year) => (
              <section className="arenaYear" key={year} aria-labelledby={`year-${year}`}>
                <h2 id={`year-${year}`}>{year}</h2>
                {list(arenas.filter((arena) => arena.starts_at.startsWith(year)))}
              </section>
            ))
          ) : (
            list(arenas)
          )}
        </>
      )}
    </div>
  );
};
