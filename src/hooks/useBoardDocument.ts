import type { ChangeEvent, FocusEvent, KeyboardEvent, TextareaHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

import { createAtomicPosition } from "../lib/puzzles/solutionPgn";
import type { ChessboardState } from "../types/chessboard";

type DocumentKind = "fen" | "pgn";

type BoardDocumentOptions = {
  fen: string;
  pgn: string;
  boardState: ChessboardState | null;
  onCommitFen: (fen: string) => void;
  onCommitPgn: (pgn: string) => void;
  pgnAfterFenCommit?: (fen: string) => string;
};

type BoardDocumentField = Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onFocus" | "onBlur" | "onKeyDown" | "onChange"
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
}: BoardDocumentOptions): BoardDocument => {
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
      setFenError(error instanceof Error ? error.message : "Invalid FEN");
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

    setPgnDraft(draft);
    setPgnError("");
    finish("pgn");
    onCommitPgn(draft);
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
    onBlur: (event: FocusEvent<HTMLTextAreaElement>) => commit(event.currentTarget.value),
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      commit(event.currentTarget.value, true);
    },
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
      dirtyRef.current[kind] = true;
      setValue(event.target.value);
      kind === "fen" ? setFenError("") : setPgnError("");
    },
  });

  return {
    fen: field("fen", fenDraft, fenError, setFenDraft, commitFen),
    pgn: field("pgn", pgnDraft, pgnError, setPgnDraft, commitPgn),
    clearErrors,
  };
};
