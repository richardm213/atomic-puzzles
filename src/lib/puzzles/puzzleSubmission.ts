import { createAtomicPosition, normalizeSolutionPgn, parseSolutionUciLines } from "./solutionPgn";

export type PuzzleSubmissionValue = {
  fen: string;
  solution: string;
  event: string;
  explanation: string;
};

export type ParsedPuzzlePgn = {
  fen: string;
  solution: string;
  event: string;
  hadHeaders: boolean;
  headerText: string;
};

const PGN_TAG_PATTERN = /^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/;
const PGN_MOVETEXT_PATTERN = /^\d+\.(?:\.\.)?\s*\S/;

const unescapePgnTagValue = (value: string): string => value.replace(/\\(["\\])/g, "$1");

export const ensurePuzzlePgnHeaders = (headerText: string, fen: string): string => {
  const headerLines = headerText.replace(/\r\n?/g, "\n").split("\n").filter(Boolean);
  const headerNames = new Set(
    headerLines
      .map((line) => line.match(PGN_TAG_PATTERN)?.[1]?.toLowerCase())
      .filter((name): name is string => Boolean(name)),
  );
  const requiredHeaders: string[] = [];

  if (!headerNames.has("variant")) requiredHeaders.push('[Variant "Atomic"]');
  if (!headerNames.has("fen")) requiredHeaders.push(`[FEN "${fen.trim()}"]`);

  return [...requiredHeaders, ...headerLines].join("\n");
};

export const parsePuzzlePgnInput = (input: string, fallbackFen: string): ParsedPuzzlePgn => {
  const headers = new Map<string, string>();
  const headerLines: string[] = [];
  const movetextLines: string[] = [];
  let hadHeaders = false;

  for (const line of input.replace(/\r\n?/g, "\n").split("\n")) {
    const tag = line.match(PGN_TAG_PATTERN);
    if (tag?.[1] !== undefined && tag[2] !== undefined) {
      hadHeaders = true;
      headerLines.push(line);
      headers.set(tag[1].toLowerCase(), unescapePgnTagValue(tag[2]).trim());
      continue;
    }
    if (line.trim().startsWith("[")) {
      throw new Error("Invalid PGN header.");
    }
    movetextLines.push(line);
  }

  const variant = headers.get("variant");
  if (variant && variant.toLowerCase() !== "atomic") {
    throw new Error('The PGN Variant header must be "Atomic".');
  }

  const solution = movetextLines.join("\n").trim();
  if (solution && !PGN_MOVETEXT_PATTERN.test(solution)) {
    throw new Error("Enter PGN movetext beginning with a move number.");
  }

  return {
    fen: headers.get("fen")?.trim() || fallbackFen.trim(),
    solution,
    event: headers.get("event")?.trim() || "",
    hadHeaders,
    headerText: headerLines.join("\n"),
  };
};

export const mergeSolutionLine = (lines: string[][], nextLine: string[]): string[][] => {
  if (!nextLine.length) return lines;
  const sameMove = (left: string, right: string): boolean => left === right;
  if (
    lines.some(
      (line) =>
        line.length === nextLine.length &&
        line.every((move, index) => sameMove(move, nextLine[index] ?? "")),
    )
  ) {
    return lines;
  }

  const extendedLineIndex = lines.findIndex(
    (line) =>
      line.length < nextLine.length &&
      line.every((move, index) => sameMove(move, nextLine[index] ?? "")),
  );
  if (extendedLineIndex < 0) return [...lines, nextLine];

  return lines.map((line, index) => (index === extendedLineIndex ? nextLine : line));
};

export const validatePuzzleSubmission = (value: PuzzleSubmissionValue): PuzzleSubmissionValue => {
  const parsedPgn = parsePuzzlePgnInput(value.solution, value.fen);
  const fen = parsedPgn.fen;
  const solution = parsedPgn.solution;
  const explanation = value.explanation.trim();
  const event = parsedPgn.event || value.event.trim();

  if (!fen) throw new Error("Enter a FEN.");
  createAtomicPosition(fen);
  if (!solution) throw new Error("Enter at least one move.");
  if (parseSolutionUciLines(fen, solution).length === 0) {
    throw new Error("The moves are not a legal atomic line from this FEN.");
  }

  return { fen, solution: normalizeSolutionPgn(fen, solution), event, explanation };
};
