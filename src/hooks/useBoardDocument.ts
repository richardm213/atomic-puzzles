import type { TextareaHTMLAttributes } from "react";

import { createAtomicPosition } from "../lib/chess/pgn";
import { parseAtomicPgnInput } from "../lib/puzzles/puzzleSubmission";
import type { ChessboardState } from "../types/chessboard";
import { normalizeBoardFen, useBoardDocumentField } from "./useBoardDocumentField";

type BoardDocumentOptions = {
  fen: string;
  pgn: string;
  boardState: ChessboardState | null;
  onCommitFen: (fen: string) => void;
  onCommitPgn: (pgn: string, initialFen?: string) => void;
  pgnAfterFenCommit?: (fen: string) => string;
};

type BoardDocumentField = Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onFocus" | "onBlur" | "onKeyDown" | "onChange" | "readOnly"
> & {
  error: string;
};

export type BoardDocument = {
  fen: BoardDocumentField;
  pgn: BoardDocumentField;
};

export const useBoardDocument = ({
  fen,
  pgn,
  boardState,
  onCommitFen,
  onCommitPgn,
  pgnAfterFenCommit,
}: BoardDocumentOptions): BoardDocument & {
  resetDrafts: (nextFen: string, nextPgn: string) => void;
} => {
  const fenInput = useBoardDocumentField(
    fen,
    (draft) => {
      const nextFen = normalizeBoardFen(draft);
      if (nextFen === fen) return fen;
      createAtomicPosition(nextFen);
      onCommitFen(nextFen);
      if (pgnAfterFenCommit) pgnInput.replace(pgnAfterFenCommit(nextFen));
      return nextFen;
    },
    "Invalid FEN",
  );

  const pgnInput = useBoardDocumentField(
    pgn,
    (draft) => {
      const parsed = parseAtomicPgnInput(draft, "");
      const initialFen = normalizeBoardFen(parsed.fen) || undefined;
      if (initialFen) createAtomicPosition(initialFen);
      onCommitPgn(draft, initialFen);
      if (initialFen && initialFen !== fen) fenInput.replace(initialFen);
      return draft;
    },
    "Invalid PGN",
  );
  const boardError = boardState?.status === "Invalid PGN" ? boardState.error || "Invalid PGN" : "";

  return {
    fen: fenInput.field,
    pgn: { ...pgnInput.field, error: pgnInput.field.error || boardError },
    resetDrafts: (nextFen, nextPgn) => {
      fenInput.replace(nextFen);
      pgnInput.replace(nextPgn);
    },
  };
};
