import type { Move, NormalMove, Role } from "chessops";
import { parseFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { makeUci, parseSquare } from "chessops/util";
import { Atomic } from "chessops/variant";

type Position = Atomic;

const isNormalMove = (move: Move): move is NormalMove => "from" in move;

export type UciSolutionEntry = {
  uci: string;
  key: string;
  questionable: boolean;
};

export type UciSolutionLine = UciSolutionEntry[];

type FirstOccurrence = { lineIndex: number; moveIndex: number } | null;

export type SolutionMoveNode<TExtras = Record<string, unknown>> = TExtras & {
  move?: string;
  children: Map<string, SolutionMoveNode<TExtras>>;
  firstOccurrence: FirstOccurrence;
};

const promotionByCode: Record<string, Role> = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

export const createAtomicPosition = (fen: string): Position => {
  const parsed = parseFen(fen);
  if (parsed.isErr) throw new Error(`Invalid FEN: ${parsed.error.message}`);

  const created = Atomic.fromSetup(parsed.value);
  if (created.isErr) throw new Error(`Invalid atomic position: ${created.error.message}`);

  return created.value;
};

export const squareName = (file: number, rank: number): string =>
  `${String.fromCharCode("a".charCodeAt(0) + file)}${rank + 1}`;

export const moveFromUci = (position: Position, uci: string): Move | null => {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  if (from === undefined || to === undefined) return null;

  const piece = position.board.get(from);
  const targetSquare = uci.slice(2, 4);
  const promotionCode = uci[4];
  const targetRank = targetSquare[1];
  const isBackRank = targetRank === "1" || targetRank === "8";
  const promotion: Role | undefined =
    (promotionCode !== undefined ? promotionByCode[promotionCode] : undefined) ??
    (piece?.role === "pawn" && isBackRank ? "queen" : undefined);

  const move: Move = promotion ? { from, to, promotion } : { from, to };
  return position.isLegal(move) ? move : null;
};

export const toComparableUci = (position: Position, uci: string, move?: Move | null): string => {
  const normalized = uci.toLowerCase();
  const activeMove = move ?? moveFromUci(position, normalized);
  if (!activeMove || !isNormalMove(activeMove)) return normalized;

  const piece = position.board.get(activeMove.from);
  if (piece?.role !== "king") return normalized;

  const fromFile = activeMove.from % 8;
  const fromRank = Math.floor(activeMove.from / 8);
  const toFile = activeMove.to % 8;
  const toRank = Math.floor(activeMove.to / 8);
  const fileDelta = toFile - fromFile;

  if (fromRank !== toRank || Math.abs(fileDelta) < 2) return normalized;

  const castledKingFile = fromFile + 2 * Math.sign(fileDelta);
  if (castledKingFile < 0 || castledKingFile > 7) return normalized;

  return `${squareName(fromFile, fromRank)}${squareName(castledKingFile, fromRank)}`;
};

type ParsedSolutionToken = { san: string; questionable: boolean };

const tokenFromSolution = (token: string): ParsedSolutionToken | null => {
  const strippedMoveNumber = token.replace(/^\d+\.(\.\.)?/, "");
  const questionable = /[!?]*\?[!?]*$/.test(strippedMoveNumber);
  const strippedAnnotation = strippedMoveNumber.replace(/[!?]+$/g, "");
  if (!strippedAnnotation) return null;
  if (strippedAnnotation === "...") return null;
  if (["*", "1-0", "0-1", "1/2-1/2"].includes(strippedAnnotation)) {
    return null;
  }
  return {
    san: strippedAnnotation,
    questionable,
  };
};

const tokenizeSolution = (solution: string): RegExpMatchArray | null =>
  solution
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\$\d+/g, " ")
    .match(/\(|\)|[^\s()]+/g);

export const movePrefix = (plyIndex: number, force = false): string => {
  if (plyIndex % 2 === 0) return `${Math.floor(plyIndex / 2) + 1}. `;
  if (force) return `${Math.floor(plyIndex / 2) + 1}... `;
  return "";
};

const startingPlyFromFen = (fen: string): number => {
  const [, turn = "w", , , , fullmove = "1"] = String(fen ?? "")
    .trim()
    .split(/\s+/);
  const fullmoveNumber = Number.parseInt(fullmove, 10);
  const basePly =
    Number.isFinite(fullmoveNumber) && fullmoveNumber > 0 ? (fullmoveNumber - 1) * 2 : 0;
  return turn === "b" ? basePly + 1 : basePly;
};

const isQuestionableMoveLabel = (move = ""): boolean => move.includes("?");

export const compareMoves = (
  moveA = "",
  moveB = "",
  fallbackA = 0,
  fallbackB = 0,
): number => {
  const questionableDiff =
    Number(isQuestionableMoveLabel(moveA)) - Number(isQuestionableMoveLabel(moveB));
  if (questionableDiff !== 0) return questionableDiff;
  return fallbackA - fallbackB;
};

export const buildSolutionMoveTree = <TExtras extends Record<string, unknown>>(
  lines: string[][],
  createNodeExtras: (lineIndex?: number) => TExtras = () => ({}) as TExtras,
): SolutionMoveNode<TExtras> => {
  const root: SolutionMoveNode<TExtras> = {
    children: new Map(),
    firstOccurrence: null,
    ...createNodeExtras(),
  };

  lines.forEach((line, lineIndex) => {
    let node: SolutionMoveNode<TExtras> = root;

    line.forEach((move, moveIndex) => {
      if (!node.children.has(move)) {
        node.children.set(move, {
          move,
          children: new Map(),
          firstOccurrence: { lineIndex, moveIndex },
          ...createNodeExtras(lineIndex),
        });
      }

      node = node.children.get(move)!;
    });
  });

  return root;
};

export const orderedChildren = <TExtras extends Record<string, unknown>>(
  node: SolutionMoveNode<TExtras>,
): SolutionMoveNode<TExtras>[] =>
  [...node.children.values()].sort((a, b) => {
    const moveOrder = compareMoves(a.move, b.move);
    if (moveOrder !== 0) return moveOrder;

    const firstLineDiff = (a.firstOccurrence?.lineIndex ?? 0) - (b.firstOccurrence?.lineIndex ?? 0);
    if (firstLineDiff !== 0) return firstLineDiff;
    return (a.firstOccurrence?.moveIndex ?? 0) - (b.firstOccurrence?.moveIndex ?? 0);
  });

export const findMainChild = <TExtras extends Record<string, unknown>>(
  children: SolutionMoveNode<TExtras>[],
): SolutionMoveNode<TExtras> | undefined => children[0];

const serializeSolutionBranch = (
  node: SolutionMoveNode,
  plyIndex: number,
  forceMoveNumber = false,
): string[] => {
  const tokens = [`${movePrefix(plyIndex, forceMoveNumber)}${node.move ?? ""}`.trim()];
  const children = orderedChildren(node);
  if (children.length === 0) return tokens;

  const [main, ...variations] = children;
  if (!main) return tokens;
  const mainTokens = serializeSolutionBranch(main, plyIndex + 1);
  const [mainHead, ...mainTail] = mainTokens;

  if (mainHead) {
    tokens.push(mainHead);
  }

  variations.forEach((variation) => {
    tokens.push(`(${serializeSolutionBranch(variation, plyIndex + 1, true).join(" ")})`);
  });

  tokens.push(...mainTail);
  return tokens;
};

const serializeSolutionLines = (sanLines: string[][], initialPly = 0): string => {
  if (!sanLines.length) return "";

  const root = buildSolutionMoveTree(sanLines);
  const rootChildren = orderedChildren(root);
  if (rootChildren.length === 0) return "";

  const [main, ...variations] = rootChildren;
  if (!main) return "";
  const tokens = [...serializeSolutionBranch(main, initialPly, initialPly % 2 === 1)];
  variations.forEach((variation) => {
    tokens.push(`(${serializeSolutionBranch(variation, initialPly, true).join(" ")})`);
  });
  return tokens.join(" ");
};

export const serializeSanLinesToPgn = (fen: string, sanLines: string[][] = []): string => {
  if (!fen || !Array.isArray(sanLines) || sanLines.length === 0) return "";
  return serializeSolutionLines(sanLines, startingPlyFromFen(fen));
};

export const parseSolutionUciLines = (fen: string, solution: unknown): UciSolutionLine[] => {
  if (typeof solution !== "string" || solution.trim().length === 0) return [];

  let position: Position;
  try {
    position = createAtomicPosition(fen);
  } catch {
    return [];
  }

  const tokens = tokenizeSolution(solution);
  if (!tokens) return [];

  const uciLines: UciSolutionLine[] = [];
  let parseFailed = false;

  const walk = (startIndex: number, startPosition: Position, line: UciSolutionLine): number => {
    let index = startIndex;
    const currentPosition = startPosition.clone();
    const currentLine: UciSolutionLine = [...line];
    let sawMove = false;
    let lastBranchPosition = currentPosition.clone();
    let lastBranchLine: UciSolutionLine = [...currentLine];

    while (index < tokens.length) {
      const token = tokens[index];
      if (token === ")") {
        if (sawMove) uciLines.push(currentLine);
        return index + 1;
      }

      if (token === "(") {
        index = walk(index + 1, lastBranchPosition, lastBranchLine);
        if (parseFailed) return tokens.length;
        continue;
      }

      const parsedToken = token !== undefined ? tokenFromSolution(token) : null;
      if (!parsedToken) {
        index += 1;
        continue;
      }

      lastBranchPosition = currentPosition.clone();
      lastBranchLine = [...currentLine];

      const move = parseSan(currentPosition, parsedToken.san);
      if (!move || !currentPosition.isLegal(move)) {
        parseFailed = true;
        return tokens.length;
      }

      const uci = makeUci(move).toLowerCase();
      currentLine.push({
        uci,
        key: toComparableUci(currentPosition, uci, move),
        questionable: parsedToken.questionable,
      });
      currentPosition.play(move);
      sawMove = true;
      index += 1;
    }

    if (sawMove) uciLines.push(currentLine);
    return index;
  };

  walk(0, position, []);
  if (parseFailed) return [];

  const unique: UciSolutionLine[] = [];
  const seen = new Set<string>();
  for (const line of uciLines) {
    if (line.length === 0) continue;
    const key = line.map((entry) => `${entry.uci}:${entry.questionable ? "q" : "s"}`).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  return unique;
};

export const convertUciLineToSan = (initialFen: string, uciLine: UciSolutionLine): string[] => {
  let position: Position;
  try {
    position = createAtomicPosition(initialFen);
  } catch {
    return [];
  }
  const sanLine: string[] = [];

  for (const entry of uciLine) {
    const move = moveFromUci(position, entry.uci);
    if (!move) break;

    const san = makeSan(position, move);
    sanLine.push(entry.questionable ? `${san}?` : san);
    position.play(move);
  }

  return sanLine;
};

export const serializeUciLinesToPgn = (fen: string, uciLines: UciSolutionLine[] = []): string => {
  if (!fen || !Array.isArray(uciLines) || uciLines.length === 0) return "";

  const sanLines = uciLines
    .map((line) => convertUciLineToSan(fen, line))
    .filter((line) => line.length > 0);

  if (sanLines.length === 0) return "";
  return serializeSolutionLines(sanLines, startingPlyFromFen(fen));
};

export const normalizeSolutionPgn = (fen: string, solution: unknown): string => {
  const normalized = typeof solution === "string" ? solution.trim() : "";
  if (!normalized || !fen) return normalized;
  if (/[()]/.test(normalized)) return normalized;

  const parsedLines = parseSolutionUciLines(fen, normalized);
  if (parsedLines.length === 0) return normalized;

  return serializeUciLinesToPgn(fen, parsedLines) || normalized;
};
