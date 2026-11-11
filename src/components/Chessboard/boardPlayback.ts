import type { BoardLineRef, BoardView, PlaybackCommand } from "../../types/chessboard";
import type { BoardHistory } from "./boardHistory";

type PlaybackLine = {
  line: Exclude<BoardLineRef, { source: "history" }>;
  history: BoardHistory;
};

export type PlaybackTarget = {
  position: BoardView["position"];
  line?: PlaybackLine;
  selectsContinuation?: boolean;
};

type PlaybackContext = {
  history: BoardHistory;
  view: BoardView;
  canBrowseIntro: boolean;
  // Only supply lines that the current session is allowed to see.
  lines: PlaybackLine[];
  keepContinuation: boolean;
};

export const resolvePlayback = (
  { history, view, canBrowseIntro, lines, keepContinuation }: PlaybackContext,
  command: PlaybackCommand,
): PlaybackTarget | null => {
  if (!history.plies.length) return null;
  const ply = history.index;

  if (view.position === "beforeIntro") {
    if (command === "start" || command === "previous" || command === "previousOption") return null;
    if (command !== "end") return { position: 0 };
  }

  const sameLine = (line: PlaybackLine): boolean =>
    view.line.source !== "history" &&
    line.line.source === view.line.source &&
    line.line.index === view.line.index;

  const sharesPrefix = (line: PlaybackLine, through: number): boolean =>
    through >= 0 &&
    history.plies.slice(0, through + 1).every((step, index) => {
      const candidate = line.history.plies[index];
      return candidate?.fen === step.fen && candidate?.key === step.key;
    });

  if (command === "previousOption" || command === "nextOption") {
    const options = new Map<string, PlaybackLine>();
    for (const line of lines) {
      const nextKey = line.history.plies[ply + 1]?.key;
      if (nextKey && !options.has(nextKey) && sharesPrefix(line, ply)) options.set(nextKey, line);
    }
    if (options.size > 1) {
      const choices = [...options.entries()];
      const activeNextKey = history.plies[ply + 1]?.key;
      const current = Math.max(
        0,
        choices.findIndex(([key]) => key === activeNextKey),
      );
      const delta = command === "nextOption" ? 1 : -1;
      const [, line] = choices[(current + delta + choices.length) % choices.length]!;
      return { position: ply, line, selectsContinuation: true };
    }
    command = command === "previousOption" ? "start" : "end";
  }

  if (canBrowseIntro && (command === "start" || (command === "previous" && ply === 0))) {
    return { position: "beforeIntro" };
  }

  const position =
    command === "start"
      ? 0
      : command === "previous"
        ? ply - 1
        : command === "next"
          ? ply + 1
          : history.plies.length - 1;

  if (command === "previous" || (command === "next" && !keepContinuation)) {
    const matchThrough = command === "previous" ? position : ply;
    const mainLine = lines.find(
      (line) =>
        line.line.index === 0 && line.history.plies[position] && sharesPrefix(line, matchThrough),
    );
    if (mainLine && !sameLine(mainLine)) return { position, line: mainLine };
  }

  if (command === "end" && view.line.source === "solution") {
    const mainLine = lines.find(({ line }) => line.source === "solution" && line.index === 0);
    if (mainLine && !sameLine(mainLine)) {
      return { position: mainLine.history.plies.length - 1, line: mainLine };
    }
  }

  return history.plies[position] && (position !== ply || view.position === "beforeIntro")
    ? { position }
    : null;
};
