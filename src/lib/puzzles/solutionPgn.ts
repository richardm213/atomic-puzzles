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
  annotation: string;
  retry: boolean;
};

export type UciSolutionLine = UciSolutionEntry[];

export type AdditiveSolutionLineMerge = {
  lines: string[][];
  lineIndex: number;
  changed: boolean;
};

type FirstOccurrence = { lineIndex: number; moveIndex: number } | null;
type ParsedSolutionLine = { line: UciSolutionLine; order: number[] };

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

export type AnnotatedSolutionMove = {
  san: string;
  annotation: string;
  retry: boolean;
};

const MOVE_ANNOTATION_SUFFIX = /[!?]+$/;
const MOVE_NUMBER_PREFIX = /^\d+\.(\.\.)?/;
const NON_MOVE_TOKENS = new Set(["", "...", "*", "1-0", "0-1", "1/2-1/2"]);

export const splitSolutionMove = (move = ""): AnnotatedSolutionMove => {
  const annotation = move.match(MOVE_ANNOTATION_SUFFIX)?.[0] ?? "";
  const san = annotation ? move.slice(0, -annotation.length) : move;
  return { san, annotation, retry: annotation.includes("?") };
};

export const stripSolutionMoveAnnotation = (move = ""): string => splitSolutionMove(move).san;

export const sameSolutionMove = (left = "", right = ""): boolean =>
  stripSolutionMoveAnnotation(left) === stripSolutionMoveAnnotation(right);

export const formatSolutionMove = (san: string, annotation = ""): string => `${san}${annotation}`;

const parseSolutionToken = (token: string): AnnotatedSolutionMove | null => {
  const moveText = token.replace(MOVE_NUMBER_PREFIX, "");
  const parsedMove = splitSolutionMove(moveText);
  return NON_MOVE_TOKENS.has(parsedMove.san) ? null : parsedMove;
};

const tokenizeSolution = (solution: string): string[] =>
  solution
    .replace(/\[[^\]]*\]/gs, " ")
    .replace(/\{[^}]*\}/gs, " ")
    .replace(/;[^\r\n]*/g, " ")
    .replace(/\$\d+/g, " ")
    .match(/\(|\)|[^\s()]+/g) ?? [];

const compareVariationOrder = (left: ParsedSolutionLine, right: ParsedSolutionLine): number => {
  const length = Math.max(left.order.length, right.order.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.order[index];
    const rightPart = right.order[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
};

const deduplicateSolutionLines = (parsedLines: ParsedSolutionLine[]): UciSolutionLine[] => {
  const unique: UciSolutionLine[] = [];
  const seen = new Set<string>();

  for (const { line } of parsedLines) {
    if (line.length === 0) continue;
    const identity = line.map((entry) => `${entry.uci}:${entry.annotation}`).join(" ");
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push(line);
  }

  return unique;
};

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

export const compareMoves = (moveA = "", moveB = "", fallbackA = 0, fallbackB = 0): number => {
  const retryDiff = Number(splitSolutionMove(moveA).retry) - Number(splitSolutionMove(moveB).retry);
  if (retryDiff !== 0) return retryDiff;
  return fallbackA - fallbackB;
};

export const mergeAdditiveSolutionLine = (
  lines: string[][],
  nextLine: string[],
  sourceLineIndex?: number,
  movesEqual: (existingMove: string, nextMove: string | undefined) => boolean = (
    existingMove,
    nextMove,
  ) => existingMove === nextMove,
): AdditiveSolutionLineMerge => {
  const fallbackLineIndex =
    sourceLineIndex !== undefined && lines[sourceLineIndex] ? sourceLineIndex : 0;
  if (nextLine.length === 0) {
    return { lines, lineIndex: fallbackLineIndex, changed: false };
  }

  const existingLineIndex = lines.findIndex(
    (line) =>
      line.length === nextLine.length &&
      line.every((move, moveIndex) => movesEqual(move, nextLine[moveIndex])),
  );
  if (existingLineIndex >= 0) {
    return { lines, lineIndex: existingLineIndex, changed: false };
  }

  const sourceLine = sourceLineIndex === undefined ? undefined : lines[sourceLineIndex];
  const extendsSourceLine = Boolean(
    sourceLine &&
    nextLine.length > sourceLine.length &&
    sourceLine.every((move, moveIndex) => movesEqual(move, nextLine[moveIndex])),
  );
  if (extendsSourceLine && sourceLineIndex !== undefined) {
    return {
      lines: lines.map((line, lineIndex) => (lineIndex === sourceLineIndex ? nextLine : line)),
      lineIndex: sourceLineIndex,
      changed: true,
    };
  }

  return {
    lines: [...lines, nextLine],
    lineIndex: lines.length,
    changed: true,
  };
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
  const mainTokens = serializeSolutionBranch(main, initialPly, initialPly % 2 === 1);
  const [mainHead, ...mainTail] = mainTokens;
  const tokens = mainHead ? [mainHead] : [];
  variations.forEach((variation) => {
    tokens.push(`(${serializeSolutionBranch(variation, initialPly, true).join(" ")})`);
  });
  tokens.push(...mainTail);
  return tokens.join(" ");
};

export const serializeSanLinesToPgn = (fen: string, sanLines: string[][] = []): string => {
  if (!fen || !Array.isArray(sanLines) || sanLines.length === 0) return "";
  return serializeSolutionLines(sanLines, startingPlyFromFen(fen));
};

export const parseSolutionUciLines = (fen: string, solution: unknown): UciSolutionLine[] => {
  // 1. Validate the raw inputs and starting position.
  if (typeof solution !== "string" || solution.trim().length === 0) return [];

  let position: Position;
  try {
    position = createAtomicPosition(fen);
  } catch {
    return [];
  }

  // 2. Remove PGN metadata/comments and split moves from variation parentheses.
  const tokens = tokenizeSolution(solution);
  if (tokens.length === 0) return [];

  // 3. Walk every branch from the position where its parent move began.
  // Each accepted token is parsed as SAN, checked for legality, and stored with
  // its exact annotation plus the derived retry flag.
  const parsedLines: ParsedSolutionLine[] = [];
  let parseFailed = false;

  const parseBranch = (
    startIndex: number,
    startPosition: Position,
    line: UciSolutionLine,
    order: number[],
    insideVariation: boolean,
  ): number => {
    let index = startIndex;
    const currentPosition = startPosition.clone();
    const currentLine: UciSolutionLine = [...line];
    let sawMove = false;
    let variationIndex = 0;
    let lastBranchPosition = currentPosition.clone();
    let lastBranchLine: UciSolutionLine = [...currentLine];

    while (index < tokens.length) {
      const token = tokens[index];
      if (token === ")") {
        if (!insideVariation) {
          parseFailed = true;
          return tokens.length;
        }
        if (!sawMove) {
          parseFailed = true;
          return tokens.length;
        }
        parsedLines.push({ line: currentLine, order });
        return index + 1;
      }

      if (token === "(") {
        index = parseBranch(
          index + 1,
          lastBranchPosition,
          lastBranchLine,
          [...order, variationIndex],
          true,
        );
        variationIndex += 1;
        if (parseFailed) return tokens.length;
        continue;
      }

      const parsedToken = token !== undefined ? parseSolutionToken(token) : null;
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
        annotation: parsedToken.annotation,
        retry: parsedToken.retry,
      });
      currentPosition.play(move);
      sawMove = true;
      index += 1;
    }

    if (insideVariation) {
      parseFailed = true;
      return tokens.length;
    }
    if (sawMove) parsedLines.push({ line: currentLine, order });
    return index;
  };

  parseBranch(0, position, [], [], false);
  if (parseFailed) return [];

  // 4. Restore PGN branch order, then remove exact duplicate lines.
  parsedLines.sort(compareVariationOrder);
  return deduplicateSolutionLines(parsedLines);
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
    sanLine.push(formatSolutionMove(san, entry.annotation));
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
