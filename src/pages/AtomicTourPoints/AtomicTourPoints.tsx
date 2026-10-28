import "./AtomicTourPoints.css";

import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable } from "../../components/DataTable/DataTable";
import { Seo } from "../../components/Seo/Seo";
import {
  atomicTourLosersBracketRoundCountForStart,
  atomicTourLosersBracketWinPoints,
  type AtomicTourMainStage,
  atomicTourStageForFinalRank,
  atomicTourStagePoints,
} from "../../lib/atomicTour/scoring";

const mainDrawFinishes: { label: string; stage: AtomicTourMainStage }[] = [
  { label: "First-round loss", stage: "entered" },
  { label: "Round of 64", stage: "round-of-64" },
  { label: "Round of 32", stage: "round-of-32" },
  { label: "Round of 16", stage: "round-of-16" },
  { label: "Quarterfinal", stage: "quarterfinal" },
  { label: "Semifinal", stage: "semifinal" },
  { label: "Winners’ final", stage: "winners-final" },
  { label: "Finalist", stage: "final" },
  { label: "Champion", stage: "champion" },
];

const losersBracketStarts: { label: string; stage: AtomicTourMainStage }[] = [
  { label: "Round of 64", stage: "round-of-64" },
  { label: "Round of 32", stage: "round-of-32" },
  { label: "Round of 16", stage: "round-of-16" },
  { label: "Quarterfinals", stage: "quarterfinal" },
  { label: "Semifinals", stage: "semifinal" },
];

const wolfarenaPlacements = [
  { label: "1st", rank: 1 },
  { label: "2nd", rank: 2 },
  { label: "3rd–4th", rank: 4 },
  { label: "5th–8th", rank: 8 },
  { label: "9th–16th", rank: 16 },
  { label: "17th–32nd", rank: 32 },
  { label: "33rd or lower", rank: 33 },
];

export const AtomicTourPointsPage = () => {
  const [losersBracketStartStage, setLosersBracketStartStage] =
    useState<AtomicTourMainStage>("round-of-16");
  const losersBracketRounds = Array.from(
    { length: atomicTourLosersBracketRoundCountForStart(losersBracketStartStage) },
    (_, roundIndex) => roundIndex,
  );

  return (
    <div className="sitePage atomicTourPointsPage">
      <Seo
        title="Atomic Tour Points"
        description="Points awarded for each Atomic Chess Tour main-draw finish and losers-bracket win."
        path="/rankings/tour/points"
      />

      <div className="panel atomicTourPointsPanel">
        <Link className="atomicTourPointsBackLink" to="/rankings/tour">
          Back to Atomic Tour rankings
        </Link>

        <header>
          <h1>Atomic Tour Points</h1>
        </header>

        <div className="atomicTourTierKey" aria-label="Event point tiers">
          <div>
            <strong>2,000-point tier</strong>
            <span>AWC and Chess.com</span>
          </div>
          <div>
            <strong>1,000-point tier</strong>
            <span>Hyper and Openings</span>
          </div>
        </div>

        <div className="atomicTourPointsTables">
          <section className="atomicTourPointsGroup" aria-labelledby="main-draw-points-title">
            <h2 id="main-draw-points-title">Main draw finish</h2>
            <DataTable className="atomicTourPointsTable">
              <thead>
                <tr>
                  <th scope="col">Finish</th>
                  <th scope="col">2,000</th>
                  <th scope="col">1,000</th>
                </tr>
              </thead>
              <tbody>
                {mainDrawFinishes.map(({ label, stage }) => (
                  <tr key={stage}>
                    <th scope="row">{label}</th>
                    <td>{atomicTourStagePoints(2000, stage).toLocaleString("en-US")}</td>
                    <td>{atomicTourStagePoints(1000, stage).toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </section>

          <section className="atomicTourPointsGroup" aria-labelledby="losers-bracket-points-title">
            <h2 id="losers-bracket-points-title">Losers-bracket win</h2>
            <label className="atomicTourLosersStartControl">
              <span>Starts with losers from</span>
              <select
                value={losersBracketStartStage}
                onChange={(event) =>
                  setLosersBracketStartStage(event.target.value as AtomicTourMainStage)
                }
              >
                {losersBracketStarts.map(({ label, stage }) => (
                  <option key={stage} value={stage}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <DataTable className="atomicTourPointsTable">
              <thead>
                <tr>
                  <th scope="col">Round</th>
                  <th scope="col">2,000</th>
                  <th scope="col">1,000</th>
                </tr>
              </thead>
              <tbody>
                {losersBracketRounds.map((roundIndex) => (
                  <tr key={roundIndex}>
                    <th scope="row">Round {roundIndex + 1}</th>
                    <td>
                      +
                      {atomicTourLosersBracketWinPoints(
                        2000,
                        roundIndex,
                        losersBracketStartStage,
                      ).toLocaleString("en-US")}
                    </td>
                    <td>
                      +
                      {atomicTourLosersBracketWinPoints(
                        1000,
                        roundIndex,
                        losersBracketStartStage,
                      ).toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </section>
        </div>

        <section className="atomicTourWolfarena" aria-labelledby="wolfarena-points-title">
          <div className="atomicTourWolfarenaCopy">
            <h2 id="wolfarena-points-title">Wolfarena final placement</h2>
            <p>
              Wolfarena awards points from each player’s final standing. Its 1,000-point scale uses
              the equivalent bracket placement tier.
            </p>
          </div>
          <DataTable className="atomicTourWolfarenaTable">
            <thead>
              <tr>
                <th scope="col">Final place</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {wolfarenaPlacements.map(({ label, rank }) => {
                const stage = atomicTourStageForFinalRank(rank)!;
                return (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{atomicTourStagePoints(1000, stage).toLocaleString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </section>

        <p className="atomicTourPointsNote">
          Played wins, wins by withdrawal, and wins by disqualification count toward the
          losers-bracket bonus. Byes, Grand Finals, and Grand Final resets do not. For
          non-champions, the combined bonus is capped below the next main-draw tier and at 20% of
          the event maximum. Champions can earn a bonus up to 10% of the event maximum.
        </p>
      </div>
    </div>
  );
};
