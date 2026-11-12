import type { ChangeEvent, TextareaHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

import { createAtomicPosition } from "../lib/chess/pgn";
import { parseAtomicPgnInput } from "../lib/puzzles/puzzleSubmission";
import type { ChessboardState } from "../types/chessboard";
import { getErrorMessage } from "../utils/errors";
import { inputCommitHandlers } from "../utils/inputCommit";

type DocumentKind = "fen" | "pgn";

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
  clearErrors: () => void;
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
  const dirtyRef = useRef<Record<DocumentKind, boolean>>({ fen: false, pgn: false });
  const activeEditorRef = useRef<DocumentKind | null>(null);
  const [fenDraft, setFenDraft] = useState(fen);
  const [pgnDraft, setPgnDraft] = useState(pgn);
  const [fenError, setFenError] = useState("");
  const [pgnError, setPgnError] = useState("");

  useEffect(() => {
    if (activeEditorRef.current !== "fen") setFenDraft(fen);
  }, [fen]);

  useEffect(() => {
    if (activeEditorRef.current !== "pgn") setPgnDraft(pgn);
  }, [pgn]);

  useEffect(() => {
    setPgnError(boardState?.status === "Invalid PGN" ? boardState.error || "Invalid PGN" : "");
  }, [boardState?.error, boardState?.status]);

  const clearErrors = (): void => {
    setFenError("");
    setPgnError("");
  };

  const finish = (kind: DocumentKind): void => {
    dirtyRef.current[kind] = false;
    activeEditorRef.current = null;
  };

  const commitFen = (draft: string, force = false): void => {
    if (!force && !dirtyRef.current.fen) {
      setFenError("");
      activeEditorRef.current = null;
      return;
    }

    const nextFen = draft.trim();
    try {
      createAtomicPosition(nextFen);
    } catch (error) {
      setFenError(getErrorMessage(error, "Invalid FEN"));
      return;
    }

    setFenDraft(nextFen);
    if (pgnAfterFenCommit) setPgnDraft(pgnAfterFenCommit(nextFen));
    clearErrors();
    finish("fen");
    dirtyRef.current.pgn = false;
    onCommitFen(nextFen);
  };

  const commitPgn = (draft: string, force = false): void => {
    if (!force && !dirtyRef.current.pgn) {
      setPgnError("");
      activeEditorRef.current = null;
      return;
    }

    try {
      // A pasted PGN can be a complete document. Read its setup FEN here so every
      // board using this shared editor starts the moves from the position declared
      // by the document rather than from the position that happened to be loaded.
      const parsed = parseAtomicPgnInput(draft, "");
      const initialFen = parsed.fen || undefined;
      if (initialFen) createAtomicPosition(initialFen);

      setPgnDraft(draft);
      if (initialFen) setFenDraft(initialFen);
      setPgnError("");
      finish("pgn");
      onCommitPgn(draft, initialFen);
    } catch (error) {
      setPgnError(getErrorMessage(error, "Invalid PGN"));
    }
  };

  const field = (
    kind: DocumentKind,
    value: string,
    error: string,
    setValue: (value: string) => void,
    commit: (value: string, force?: boolean) => void,
  ): BoardDocumentField => ({
    value,
    error,
    onFocus: () => {
      dirtyRef.current[kind] = false;
      activeEditorRef.current = kind;
    },
    ...inputCommitHandlers(commit),
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
      dirtyRef.current[kind] = true;
      setValue(event.target.value);
      if (kind === "fen") setFenError("");
      else setPgnError("");
    },
  });

  return {
    fen: field("fen", fenDraft, fenError, setFenDraft, commitFen),
    pgn: field("pgn", pgnDraft, pgnError, setPgnDraft, commitPgn),
    clearErrors,
    resetDrafts: (nextFen, nextPgn) => {
      activeEditorRef.current = null;
      dirtyRef.current = { fen: false, pgn: false };
      setFenDraft(nextFen);
      setPgnDraft(nextPgn);
      clearErrors();
    },
  };
};
