import {
  atomicTourAwardExpiryDate,
  atomicTourEventPoints,
  type AtomicTourMainResult,
  type AtomicTourMainStage,
  atomicTourMainStageForResults,
  atomicTourPlacementAfterChampionship,
  atomicTourQualifierWinEarnsPoints,
  atomicTourQualifierWinPoints,
  atomicTourStageForRound,
  calculateKnockoutTourPoints,
} from "./atomicTourScoring";

export type CatalogRow = {
  id: string;
  series_key: string;
  start_date: string;
  end_date: string | null;
};

export type MatchRow = {
  tournament: string;
  bracket: string;
  round: string;
  order: number;
  id: string;
  match_id: string | null;
  played_on: string | null;
  p1: string | null;
  p2: string | null;
  s1: number;
  s2: number;
  outcome_type?: string | null;
};

export type PointAward = {
  award_key: string;
  tournament_id: string;
  player_name: string;
  source_type:
    "placement" | "losers_win" | "acl_win" | "acl_draw" | "arena_placement" | "adjustment";
  source_key: string;
  awarded_on: string;
  expires_on: string;
  points: number;
  description: string;
};

const excludedPlayers = new Set(["neverofzero", "thuban", "taisthuban", "jasos12"]);
const normalize = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const score = (value: unknown): number => Number(value) || 0;
const awardKey = (...parts: string[]): string =>
  parts
    .map((part) => normalize(part).replaceAll(/[^a-z0-9_-]+/g, "-"))
    .filter(Boolean)
    .join(":");
const isChampionshipMatch = (match: MatchRow): boolean =>
  match.bracket === "grand_final" || match.round.trim().toLowerCase().includes("grand final");

const stageOrder: AtomicTourMainStage[] = [
  "entered",
  "round-of-64",
  "round-of-32",
  "round-of-16",
  "quarterfinal",
  "semifinal",
  "winners-final",
  "final",
  "champion",
];

const laterStage = (left: AtomicTourMainStage, right: AtomicTourMainStage): AtomicTourMainStage =>
  stageOrder.indexOf(left) >= stageOrder.indexOf(right) ? left : right;

const losersRoundOrder = (round: string): number => {
  const normalized = round.trim().toLowerCase();
  const numberedRound = normalized.match(/round\s+(\d+)/);
  if (numberedRound) return Number(numberedRound[1]);
  if (normalized.includes("quarterfinal")) return 100;
  if (normalized.includes("semifinal")) return 101;
  if (normalized.includes("final")) return 102;
  return 0;
};

const qualifierRoundOrder = (round: string): number => {
  const normalized = round.trim().toLowerCase();
  if (normalized === "first round") return 1;
  if (normalized === "second round") return 2;
  if (normalized === "qualifying round") return 3;
  const numberedRound = normalized.match(/(?:qualifying\s+)?round\s+(\d+)/);
  return numberedRound ? Number(numberedRound[1]) : 100;
};

const winner = (match: MatchRow): string => {
  if (score(match.s1) > score(match.s2)) return normalize(match.p1);
  if (score(match.s2) > score(match.s1)) return normalize(match.p2);
  return "";
};

const isBonusEligibleResult = (match: MatchRow): boolean => {
  const playerOne = normalize(match.p1);
  const playerTwo = normalize(match.p2);
  return Boolean(
    playerOne && playerTwo && playerOne !== "bye" && playerTwo !== "bye" && winner(match),
  );
};

export const knockoutAwards = async (
  event: CatalogRow,
  matches: MatchRow[],
  seededPlayers: ReadonlySet<string>,
  today: string,
  matchDate: (matchId: string | null, fallback: string) => Promise<string>,
): Promise<PointAward[]> => {
  const tier = atomicTourEventPoints[event.id] ?? atomicTourEventPoints[event.series_key];
  if (!tier) return [];
  const fallbackDate = event.end_date ?? today;
  const playerStages = new Map<string, AtomicTourMainStage>();
  const playerMainMatches = new Map<string, MatchRow[]>();
  const allMainMatches = matches.filter(
    (match) => match.bracket === "main" || match.bracket === "grand_final",
  );
  const championshipMatches = allMainMatches.filter(isChampionshipMatch);
  const playedChampionshipMatches = championshipMatches
    .filter((match) => winner(match))
    .sort((left, right) => {
      const leftIsReset = /reset/i.test(`${left.round} ${left.id}`);
      const rightIsReset = /reset/i.test(`${right.round} ${right.id}`);
      return Number(leftIsReset) - Number(rightIsReset) || left.order - right.order;
    });
  const championshipDecider = playedChampionshipMatches.at(-1);
  const hasChampionshipMatch = championshipMatches.length > 0;
  const losersRounds = [
    ...new Set(
      matches
        .filter((match) => match.bracket === "losers")
        .map((match) => match.round.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => losersRoundOrder(left) - losersRoundOrder(right));
  const mainMatches = allMainMatches.filter((match) => !isChampionshipMatch(match));
  const eventFirstStage = mainMatches.reduce<AtomicTourMainStage>((firstStage, match) => {
    const matchStage = atomicTourStageForRound(match.round, hasChampionshipMatch);
    return stageOrder.indexOf(matchStage) < stageOrder.indexOf(firstStage)
      ? matchStage
      : firstStage;
  }, "champion");
  const losersBracketPlayers = new Set(
    matches
      .filter((match) => match.bracket === "losers")
      .flatMap((match) => [normalize(match.p1), normalize(match.p2)])
      .filter((player) => player && player !== "bye"),
  );
  const losersBracketStartStage = mainMatches.reduce<AtomicTourMainStage | null>(
    (earliestStage, match) => {
      const matchWinner = winner(match);
      if (!matchWinner) return earliestStage;
      const playerOne = normalize(match.p1);
      const playerTwo = normalize(match.p2);
      const matchLoser = matchWinner === playerOne ? playerTwo : playerOne;
      if (!losersBracketPlayers.has(matchLoser)) return earliestStage;
      const feederStage = atomicTourStageForRound(match.round, hasChampionshipMatch);
      if (!earliestStage) return feederStage;
      return stageOrder.indexOf(feederStage) < stageOrder.indexOf(earliestStage)
        ? feederStage
        : earliestStage;
    },
    null,
  );

  mainMatches.forEach((match) => {
    [match.p1, match.p2]
      .map(normalize)
      .filter(Boolean)
      .forEach((player) => {
        if (player === "bye") return;
        playerStages.set(
          player,
          laterStage(
            playerStages.get(player) ?? "entered",
            atomicTourStageForRound(match.round, hasChampionshipMatch),
          ),
        );
        const current = playerMainMatches.get(player) ?? [];
        current.push(match);
        playerMainMatches.set(player, current);
      });
  });
  championshipMatches.forEach((match) => {
    [match.p1, match.p2]
      .map(normalize)
      .filter((player) => player && player !== "bye")
      .forEach((player) => {
        if (!playerStages.has(player)) playerStages.set(player, "final");
      });
  });

  const awards: PointAward[] = [];
  for (const [player] of playerStages) {
    if (excludedPlayers.has(player)) continue;
    const sourceMatches = playerMainMatches.get(player) ?? [];
    const playerChampionshipMatches = championshipMatches.filter(
      (match) => normalize(match.p1) === player || normalize(match.p2) === player,
    );
    const mainResults = sourceMatches.flatMap<AtomicTourMainResult>((match) => {
      const playerOne = normalize(match.p1);
      const playerTwo = normalize(match.p2);
      const opponent = playerOne === player ? playerTwo : playerOne;
      if (!opponent || opponent === "bye") {
        return [
          {
            stage: atomicTourStageForRound(match.round, hasChampionshipMatch),
            outcome: "bye" as const,
          },
        ];
      }
      const matchWinner = winner(match);
      if (!matchWinner) return [];
      return [
        {
          stage: atomicTourStageForRound(match.round, hasChampionshipMatch),
          outcome: matchWinner === player ? ("win" as const) : ("loss" as const),
        },
      ];
    });
    const hasSeededRoundOf32Bye =
      event.id === "awc2026" &&
      seededPlayers.has(player) &&
      sourceMatches.some(
        (match) =>
          atomicTourStageForRound(match.round) === "round-of-32" &&
          [normalize(match.p1), normalize(match.p2)].includes("bye") &&
          winner(match) === player,
      ) &&
      sourceMatches.some(
        (match) =>
          atomicTourStageForRound(match.round) === "round-of-16" &&
          isBonusEligibleResult(match) &&
          winner(match) !== player &&
          score(match.s1) + score(match.s2) > 1 &&
          !match.outcome_type,
      );
    let earnedStage = atomicTourMainStageForResults(
      eventFirstStage,
      mainResults,
      hasSeededRoundOf32Bye,
    );
    if (
      championshipDecider &&
      [normalize(championshipDecider.p1), normalize(championshipDecider.p2)].includes(player)
    ) {
      earnedStage = atomicTourPlacementAfterChampionship(
        earnedStage,
        winner(championshipDecider) === player ? "win" : "loss",
      );
    }
    if (!earnedStage) continue;
    const latestSource = [...sourceMatches, ...playerChampionshipMatches]
      .filter((match) => {
        const playerOne = normalize(match.p1);
        const opponent = playerOne === player ? normalize(match.p2) : playerOne;
        return opponent && opponent !== "bye" && winner(match);
      })
      .sort(
        (left, right) =>
          stageOrder.indexOf(atomicTourStageForRound(right.round, hasChampionshipMatch)) -
            stageOrder.indexOf(atomicTourStageForRound(left.round, hasChampionshipMatch)) ||
          right.order - left.order,
      )[0];
    const awardedOn = latestSource?.played_on ?? fallbackDate;
    const losersWins = matches.filter(
      (match) =>
        match.bracket === "losers" && isBonusEligibleResult(match) && winner(match) === player,
    );
    const pointBreakdown = calculateKnockoutTourPoints({
      tier,
      mainStage: earnedStage,
      losersBracketWinRounds: losersWins.map((match) =>
        Math.max(0, losersRounds.indexOf(match.round.trim())),
      ),
      losersBracketStartStage: losersBracketStartStage ?? "round-of-64",
    });
    awards.push({
      award_key: awardKey(event.id, player, "placement"),
      tournament_id: event.id,
      player_name: player,
      source_type: "placement",
      source_key: "placement",
      awarded_on: awardedOn,
      expires_on: atomicTourAwardExpiryDate(awardedOn),
      points: pointBreakdown.basePoints,
      description: `${earnedStage.replaceAll("-", " ")} placement`,
    });
    if (pointBreakdown.bonusPoints > 0) {
      const latestLosersWin = losersWins.sort((left, right) => right.order - left.order)[0];
      const bonusDate = latestLosersWin?.played_on ?? fallbackDate;
      awards.push({
        award_key: awardKey(event.id, player, "losers-bonus"),
        tournament_id: event.id,
        player_name: player,
        source_type: "losers_win",
        source_key: "losers-bonus",
        awarded_on: bonusDate,
        expires_on: atomicTourAwardExpiryDate(bonusDate),
        points: pointBreakdown.bonusPoints,
        description: `${losersWins.length} losers-bracket ${losersWins.length === 1 ? "win" : "wins"}`,
      });
    }
  }

  const qualifierMatches = matches.filter((match) => match.bracket === "qualifying");
  const qualifierRounds = [
    ...new Set(qualifierMatches.map((match) => match.round.trim()).filter(Boolean)),
  ].sort((left, right) => qualifierRoundOrder(left) - qualifierRoundOrder(right));
  const firstRoundWinners = new Set(
    qualifierMatches
      .filter(
        (match) =>
          match.round.trim() === qualifierRounds[0] &&
          normalize(match.outcome_type) !== "withdrawal",
      )
      .map(winner),
  );
  for (const match of qualifierMatches) {
    if (!isBonusEligibleResult(match)) continue;
    const player = winner(match);
    if (!player || excludedPlayers.has(player)) continue;
    const roundIndex = Math.max(0, qualifierRounds.indexOf(match.round.trim()));
    if (
      !atomicTourQualifierWinEarnsPoints({
        seriesKey: event.series_key,
        roundIndex,
        outcomeType: match.outcome_type,
        wonPlayedFirstRound: firstRoundWinners.has(player),
      })
    )
      continue;
    const awardedOn =
      match.played_on ||
      (event.series_key === "awc" ? await matchDate(match.match_id, "") : fallbackDate);
    if (!awardedOn) {
      console.warn(`Skipping undated AWC qualifier award: ${event.id}/${match.id}`);
      continue;
    }
    const roundsRemaining = qualifierRounds.length - roundIndex;
    awards.push({
      award_key: awardKey(event.id, player, "qualifier-win", match.id),
      tournament_id: event.id,
      player_name: player,
      source_type: "placement",
      source_key: match.id,
      awarded_on: awardedOn,
      expires_on: atomicTourAwardExpiryDate(awardedOn),
      points: atomicTourQualifierWinPoints(
        tier,
        roundIndex,
        qualifierRounds.length,
        event.series_key,
      ),
      description:
        event.series_key === "a960e"
          ? "group-stage win"
          : `qualifier win, ${roundsRemaining} ${
              roundsRemaining === 1 ? "round" : "rounds"
            } from main draw`,
    });
  }
  return awards;
};
