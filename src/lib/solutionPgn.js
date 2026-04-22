import { parseFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { makeUci, parseSquare } from "chessops/util";
import { Atomic } from "chessops/variant";

const createAtomicPosition = (fen) => {
  const parsed = parseFen(fen);
  if (parsed.isErr) {
    return {
      ok: false,
      error: `Invalid FEN: ${parsed.error.message}`,
    };
  }

  const created = Atomic.fromSetup(parsed.value);
  if (created.isErr) {
    return {
      ok: false,
      error: `Atomic setup error: ${created.error.message}`,
    };
  }

  return {
    ok: true,
    position: created.value,
  };
};

const toPromotion = (square) => {
  const rank = square[1];
  return rank === "1" || rank === "8" ? "queen" : undefined;
};

const toComparableUci = (position, uci, move) => {
  const normalized = uci.toLowerCase();
  const activeMove = move ?? moveFromUci(position, normalized);
  if (!activeMove) return normalized;

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

const tokenFromSolution = (token) => {
  const strippedMoveNumber = token.replace(/^\d+\.(\.\.)?/, "");
  const questionable = /[!?]*\?[!?]*$/.test(strippedMoveNumber);
  const strippedAnnotation = strippedMoveNumber.replace(/[!?]+$/g, "");
  if (!strippedAnnotation) return null;
  if (["*", "1-0", "0-1", "1/2-1/2"].includes(strippedAnnotation)) {
    return null;
  }
  return {
    san: strippedAnnotation,
    questionable,
  };
};

const tokenizeSolution = (solution) =>
  solution
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\$\d+/g, " ")
    .match(/\(|\)|[^\s()]+/g);

const squareName = (file, rank) => `${String.fromCharCode("a".charCodeAt(0) + file)}${rank + 1}`;

const moveFromUci = (position, uci) => {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  if (from === undefined || to === undefined) return null;

  const piece = position.board.get(from);
  const promotionCode = uci[4];
  const promotion =
    promotionCode === "q"
      ? "queen"
      : promotionCode === "r"
        ? "rook"
        : promotionCode === "b"
          ? "bishop"
          : promotionCode === "n"
            ? "knight"
            : piece?.role === "pawn"
              ? toPromotion(uci.slice(2, 4))
              : undefined;

  const move = { from, to, promotion };
  return position.isLegal(move) ? move : null;
};

export const movePrefix = (plyIndex, force = false) => {
  if (plyIndex % 2 === 0) return `${Math.floor(plyIndex / 2) + 1}. `;
  if (force) return `${Math.floor(plyIndex / 2) + 1}... `;
  return "";
};

const startingPlyFromFen = (fen) => {
  const [, turn = "w", , , , fullmove = "1"] = String(fen || "")
    .trim()
    .split(/\s+/);
  const fullmoveNumber = Number.parseInt(fullmove, 10);
  const basePly =
    Number.isFinite(fullmoveNumber) && fullmoveNumber > 0 ? (fullmoveNumber - 1) * 2 : 0;
  return turn === "b" ? basePly + 1 : basePly;
};

const isQuestionableMoveLabel = (move = "") => move.includes("?");

export const compareMoves = (moveA = "", moveB = "", fallbackA = 0, fallbackB = 0) => {
  const questionableDiff =
    Number(isQuestionableMoveLabel(moveA)) - Number(isQuestionableMoveLabel(moveB));
  if (questionableDiff !== 0) return questionableDiff;
  return fallbackA - fallbackB;
};

export const buildSolutionMoveTree = (lines, createNodeExtras = () => ({})) => {
  const root = {
    children: new Map(),
    firstOccurrence: null,
    ...createNodeExtras(),
  };

  lines.forEach((line, lineIndex) => {
    let node = root;

    line.forEach((move, moveIndex) => {
      if (!node.children.has(move)) {
        node.children.set(move, {
          move,
          children: new Map(),
          firstOccurrence: { lineIndex, moveIndex },
          ...createNodeExtras(lineIndex),
        });
      }

      node = node.children.get(move);
    });
  });

  return root;
};

export const orderedChildren = (node) =>
  [...node.children.values()].sort((a, b) => {
    const moveOrder = compareMoves(a.move, b.move);
    if (moveOrder !== 0) return moveOrder;

    const firstLineDiff = (a.firstOccurrence?.lineIndex ?? 0) - (b.firstOccurrence?.lineIndex ?? 0);
    if (firstLineDiff !== 0) return firstLineDiff;
    return (a.firstOccurrence?.moveIndex ?? 0) - (b.firstOccurrence?.moveIndex ?? 0);
  });

export const findMainChild = (children) => children[0];

const serializeSolutionBranch = (node, plyIndex, forceMoveNumber = false) => {
  const tokens = [`${movePrefix(plyIndex, forceMoveNumber)}${node.move}`.trim()];
  const children = orderedChildren(node);
  if (children.length === 0) return tokens;

  const [main, ...variations] = children;
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

const serializeSolutionLines = (sanLines, initialPly = 0) => {
  if (!sanLines.length) return "";

  const root = buildSolutionMoveTree(sanLines);
  const rootChildren = orderedChildren(root);
  if (rootChildren.length === 0) return "";

  const [main, ...variations] = rootChildren;
  const tokens = [...serializeSolutionBranch(main, initialPly, initialPly % 2 === 1)];
  variations.forEach((variation) => {
    tokens.push(`(${serializeSolutionBranch(variation, initialPly, true).join(" ")})`);
  });
  return tokens.join(" ");
};

export const serializeSanLinesToPgn = (fen, sanLines = []) => {
  if (!fen || !Array.isArray(sanLines) || sanLines.length === 0) return "";
  return serializeSolutionLines(sanLines, startingPlyFromFen(fen));
};

const lineSignature = (line) =>
  line.map((entry) => `${entry.uci}:${entry.questionable ? "q" : "s"}`).join(" ");

const linesMatch = (expected, actual) => {
  if (expected.length !== actual.length) return false;

  const expectedSorted = expected.map(lineSignature).sort();
  const actualSorted = actual.map(lineSignature).sort();
  return expectedSorted.every((line, index) => line === actualSorted[index]);
};

export const parseSolutionUciLines = (fen, solution) => {
  if (typeof solution !== "string" || solution.trim().length === 0) return [];

  const created = createAtomicPosition(fen);
  if (!created.ok) return [];

  const tokens = tokenizeSolution(solution);
  if (!tokens) return [];

  const uciLines = [];

  const walk = (startIndex, position, line) => {
    let index = startIndex;
    const currentPosition = position.clone();
    const currentLine = [...line];
    let sawMove = false;
    let lastBranchPosition = currentPosition.clone();
    let lastBranchLine = [...currentLine];

    while (index < tokens.length) {
      const token = tokens[index];
      if (token === ")") {
        if (sawMove) uciLines.push(currentLine);
        return index + 1;
      }

      if (token === "(") {
        index = walk(index + 1, lastBranchPosition, lastBranchLine);
        continue;
      }

      const parsedToken = tokenFromSolution(token);
      if (!parsedToken) {
        index += 1;
        continue;
      }

      lastBranchPosition = currentPosition.clone();
      lastBranchLine = [...currentLine];

      const move = parseSan(currentPosition, parsedToken.san);
      if (!move || !currentPosition.isLegal(move)) {
        index += 1;
        continue;
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

  walk(0, created.position, []);

  const unique = [];
  const seen = new Set();
  for (const line of uciLines) {
    if (line.length === 0) continue;
    const key = line.map((entry) => `${entry.uci}:${entry.questionable ? "q" : "s"}`).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  return unique;
};

export const convertUciLineToSan = (initialFen, uciLine) => {
  const created = createAtomicPosition(initialFen);
  if (!created.ok) return [];

  const position = created.position;
  const sanLine = [];

  for (const entry of uciLine) {
    const move = moveFromUci(position, entry.uci);
    if (!move) break;

    const san = makeSan(position, move);
    sanLine.push(entry.questionable ? `${san}?` : san);
    position.play(move);
  }

  return sanLine;
};

export const normalizeSolutionPgn = (fen, solution) => {
  const normalized = typeof solution === "string" ? solution.trim() : "";
  if (!normalized || !fen) return normalized;
  if (/[()]/.test(normalized)) return normalized;

  const parsedLines = parseSolutionUciLines(fen, normalized);
  if (parsedLines.length === 0) return normalized;

  const sanLines = parsedLines
    .map((line) => convertUciLineToSan(fen, line))
    .filter((line) => line.length > 0);

  const serialized = serializeSolutionLines(sanLines, startingPlyFromFen(fen));
  if (!serialized) return normalized;

  const reparsedLines = parseSolutionUciLines(fen, serialized);
  return linesMatch(parsedLines, reparsedLines) ? serialized : normalized;
};
