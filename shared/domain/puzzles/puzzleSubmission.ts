import { createAtomicPosition, parseSolutionUciLines, serializeUciLinesToPgn } from "./solutionPgn";

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

export const compactPuzzleSolution = (solution: string): string =>
  solution
    .replace(/\\r\\n|\\n|\\r|[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const splitPuzzlePgnBatch = (input: string): string[] => {
  const games: string[] = [];
  let currentLines: string[] = [];
  let hasMovetext = false;

  const flush = (): void => {
    const game = currentLines.join("\n").trim();
    if (game) games.push(game);
    currentLines = [];
    hasMovetext = false;
  };

  for (const line of input.replace(/\r\n?/g, "\n").split("\n")) {
    const isHeader = PGN_TAG_PATTERN.test(line);
    if (isHeader && hasMovetext) flush();
    currentLines.push(line);
    if (!isHeader && line.trim()) hasMovetext = true;
  }
  flush();

  return games;
};

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

export const validateParsedPuzzleSubmission = (
  value: PuzzleSubmissionValue,
  parsedPgn: ParsedPuzzlePgn,
): PuzzleSubmissionValue => {
  const fen = parsedPgn.fen;
  const solution = parsedPgn.solution;
  const explanation = value.explanation.trim();
  const event = parsedPgn.event || value.event.trim();

  if (!fen) throw new Error("Enter a FEN.");
  createAtomicPosition(fen);
  if (!solution) throw new Error("Enter at least one move.");
  const solutionLines = parseSolutionUciLines(fen, solution);
  if (solutionLines.length === 0) {
    throw new Error("The moves are not a legal atomic line from this FEN.");
  }

  const normalizedSolution = /[()]/.test(solution)
    ? solution.trim()
    : serializeUciLinesToPgn(fen, solutionLines) || solution.trim();
  return { fen, solution: normalizedSolution, event, explanation };
};

export const validatePuzzleSubmission = (value: PuzzleSubmissionValue): PuzzleSubmissionValue =>
  validateParsedPuzzleSubmission(value, parsePuzzlePgnInput(value.solution, value.fen));
