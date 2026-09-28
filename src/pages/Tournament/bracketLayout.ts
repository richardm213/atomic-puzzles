import type { TournamentBracketStage, TournamentMatch } from "../../lib/matches/tournaments";

export type StageLayout = {
  rounds: TournamentBracketStage["rounds"];
  width: number;
  height: number;
  positionedMatches: PositionedMatch[];
  connectors: ConnectorSegment[];
} | null;

export type PositionedMatch = TournamentMatch & {
  x: number;
  y: number;
};

type MatchPosition = { x: number; y: number };
type SourcePosition = { id: string; rightX: number; centerY: number };

export type ConnectorSegment = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const hiddenStartRoundsByStage: Record<string, Set<string>> = {
  main: new Set(["Grand Final", "Grand Final Reset"]),
};

export const getStartRoundOptions = (
  stage: TournamentBracketStage,
): TournamentBracketStage["rounds"] =>
  stage.rounds.filter((round) => !hiddenStartRoundsByStage[stage.key]?.has(round.roundName));

const roundShortLabels: Record<string, string> = {
  "Round of 128": "R128",
  "Round of 64": "R64",
  "Round of 32": "R32",
  "Round of 16": "R16",
  Quarterfinals: "QF",
  Semifinals: "SF",
  Finals: "F",
  "Grand Final": "GF",
  "Grand Final Reset": "Reset",
  "Round 1": "R1",
  "Round 2": "R2",
  "Round 3": "R3",
  "Round 4": "R4",
  "Round 5": "R5",
  Semifinal: "SF",
  Final: "F",
  "Set 1": "Set 1",
  Reset: "Reset",
};

export const getRoundShortLabel = (roundName: string): string =>
  roundShortLabels[roundName] ?? roundName.replace(/^Round\s+/i, "R");

export const CARD_WIDTH = 260;
const CARD_HEIGHT = 102;
export const COLUMN_GAP = 78;
const LEAF_GAP = 26;
export const BOARD_PADDING = 18;
const BOARD_BOTTOM_PADDING = 4;
export const HEADER_SPACE = 64;
const CARD_CENTER_ANCHOR_OFFSET = CARD_HEIGHT / 2;
export const DEFAULT_STAGE_ZOOM = 0.85;
const MIN_STAGE_ZOOM = 0.55;
const MAX_STAGE_ZOOM = 1.35;
export const STAGE_ZOOM_STEP = 0.15;
const TOURNAMENT_VIEW_STORAGE_KEY = "tournament-view:v4:";
export const SEEDS_STAGE_KEY = "seeds";

export type SavedTournamentView = {
  startRounds?: Record<string, string>;
  zoomLevels?: Record<string, number>;
  activeStageKey?: string;
  scrollPositions?: Record<string, { left?: number; top?: number }>;
  pageScrollY?: number;
};

export const buildStartRoundState = (
  stages: TournamentBracketStage[] = [],
  defaultMainBracketStartRound = "",
): Record<string, string> =>
  Object.fromEntries(
    stages.map((stage) => {
      const configuredRound =
        stage.key === "main" &&
        stage.rounds.some((round) => round.roundName === defaultMainBracketStartRound)
          ? defaultMainBracketStartRound
          : "";
      return [stage.key, configuredRound || stage.rounds[0]?.roundName || ""];
    }),
  );

export const buildZoomState = (
  stages: TournamentBracketStage[],
  savedZoomLevels: Record<string, number> = {},
): Record<string, number> =>
  Object.fromEntries(
    stages.map((stage) => [stage.key, savedZoomLevels[stage.key] ?? DEFAULT_STAGE_ZOOM]),
  );

export const getStageStartRound = (
  stage: TournamentBracketStage,
  startRounds: Record<string, string>,
): string => startRounds[stage.key] || stage.rounds[0]?.roundName || "";

export const clampZoom = (zoomLevel: unknown): number =>
  Math.min(MAX_STAGE_ZOOM, Math.max(MIN_STAGE_ZOOM, Number(zoomLevel) || DEFAULT_STAGE_ZOOM));

export const zoomDisplayPercent = (zoomLevel: number): number =>
  Math.round((zoomLevel / DEFAULT_STAGE_ZOOM) * 100);

export const getTournamentViewStorageKey = (tournamentId: string): string =>
  `${TOURNAMENT_VIEW_STORAGE_KEY}${tournamentId}`;

export const readSavedTournamentView = (tournamentId: string): SavedTournamentView | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(getTournamentViewStorageKey(tournamentId));
    if (!rawValue) return null;

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return null;
    }

    return parsedValue;
  } catch {
    window.sessionStorage.removeItem(getTournamentViewStorageKey(tournamentId));
    return null;
  }
};

export const getVisibleRounds = (
  stage: TournamentBracketStage,
  startRoundName: string,
): TournamentBracketStage["rounds"] => {
  const startIndex = stage.rounds.findIndex((round) => round.roundName === startRoundName);
  return stage.rounds.slice(Math.max(0, startIndex));
};

const trophyRoundNames = new Set([
  "Final",
  "Finals",
  "Grand Final",
  "Grand Final Reset",
  "Set 1",
  "Reset",
]);

export const getStageTrophyMatchId = (
  stage: TournamentBracketStage,
  decisiveMatchId: string,
): string => {
  const decisiveMatch = stage.rounds
    .flatMap((round) => round.matches)
    .find((match) => match.id === decisiveMatchId);
  if (decisiveMatch) return decisiveMatch.id;
  if (stage.key !== "main") return "";

  const finalRound =
    [...stage.rounds].reverse().find((round) => trophyRoundNames.has(round.roundName)) ??
    stage.rounds.at(-1);

  return finalRound?.matches.at(-1)?.id ?? "";
};

const createConnector = (
  key: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): ConnectorSegment => ({ key, x1, y1, x2, y2 });

export const buildStageTreeLayout = (
  stage: TournamentBracketStage,
  startRoundName: string,
): StageLayout => {
  const rounds = getVisibleRounds(stage, startRoundName);
  if (!rounds.length) return null;

  const incoming = new Map<string, string[]>();
  const matchesByKey = new Map<string, TournamentMatch>();

  rounds.forEach((round) => {
    round.matches.forEach((match) => matchesByKey.set(match.id, match));
  });

  rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (!match.winner_to || !matchesByKey.has(match.winner_to)) return;
      const existing = incoming.get(match.winner_to) || [];
      existing.push(match.id);
      incoming.set(match.winner_to, existing);
    });
  });

  const positionedMatches: PositionedMatch[] = [];
  const positions = new Map<string, MatchPosition>();
  const connectors: ConnectorSegment[] = [];
  let maxY = 0;

  rounds.forEach((round, roundIndex) => {
    const x = BOARD_PADDING + roundIndex * (CARD_WIDTH + COLUMN_GAP);
    round.matches.forEach((match, matchIndex) => {
      const feederCenters = (incoming.get(match.id) || [])
        .map((key) => positions.get(key))
        .filter((position): position is MatchPosition => Boolean(position))
        .map((position) => position.y + CARD_CENTER_ANCHOR_OFFSET);
      const fallbackY = HEADER_SPACE + BOARD_PADDING + matchIndex * (CARD_HEIGHT + LEAF_GAP);
      const y = feederCenters.length
        ? feederCenters.reduce((sum, value) => sum + value, 0) / feederCenters.length -
          CARD_CENTER_ANCHOR_OFFSET
        : fallbackY;

      positions.set(match.id, { x, y });
      positionedMatches.push({ ...match, x, y });
      maxY = Math.max(maxY, y + CARD_HEIGHT);
    });
  });

  incoming.forEach((sourceMatchIds, targetMatchId) => {
    const targetPosition = positions.get(targetMatchId);
    if (!targetPosition) return;

    const sourcePositions = sourceMatchIds
      .map((sourceMatchId) => {
        const position = positions.get(sourceMatchId);
        return position
          ? {
              id: sourceMatchId,
              rightX: position.x + CARD_WIDTH,
              centerY: position.y + CARD_CENTER_ANCHOR_OFFSET,
            }
          : null;
      })
      .filter((source): source is SourcePosition => source !== null);
    if (!sourcePositions.length) return;

    const targetLeftX = targetPosition.x;
    const targetCenterY = targetPosition.y + CARD_CENTER_ANCHOR_OFFSET;
    if (sourcePositions.length === 1) {
      const source = sourcePositions[0]!;
      const elbowX = source.rightX + (targetLeftX - source.rightX) / 2;
      if (Math.abs(source.centerY - targetCenterY) < 0.5) {
        connectors.push(
          createConnector(
            `${source.id}-${targetMatchId}-straight`,
            source.rightX,
            source.centerY,
            targetLeftX,
            targetCenterY,
          ),
        );
        return;
      }
      connectors.push(
        createConnector(
          `${source.id}-${targetMatchId}-source-arm`,
          source.rightX,
          source.centerY,
          elbowX,
          source.centerY,
        ),
        createConnector(
          `${source.id}-${targetMatchId}-elbow`,
          elbowX,
          source.centerY,
          elbowX,
          targetCenterY,
        ),
        createConnector(
          `${source.id}-${targetMatchId}-target-arm`,
          elbowX,
          targetCenterY,
          targetLeftX,
          targetCenterY,
        ),
      );
      return;
    }

    const junctionX = sourcePositions[0]!.rightX + (targetLeftX - sourcePositions[0]!.rightX) / 2;
    const sourceYValues = [...sourcePositions.map((source) => source.centerY), targetCenterY];
    sourcePositions.forEach((source) => {
      connectors.push(
        createConnector(
          `${source.id}-${targetMatchId}-source-arm`,
          source.rightX,
          source.centerY,
          junctionX,
          source.centerY,
        ),
      );
    });
    connectors.push(
      createConnector(
        `${targetMatchId}-merge-spine`,
        junctionX,
        Math.min(...sourceYValues),
        junctionX,
        Math.max(...sourceYValues),
      ),
      createConnector(
        `${targetMatchId}-target-arm`,
        junctionX,
        targetCenterY,
        targetLeftX,
        targetCenterY,
      ),
    );
  });

  return {
    rounds,
    width:
      BOARD_PADDING * 2 + rounds.length * CARD_WIDTH + Math.max(0, rounds.length - 1) * COLUMN_GAP,
    height: maxY + BOARD_BOTTOM_PADDING,
    positionedMatches,
    connectors,
  };
};
