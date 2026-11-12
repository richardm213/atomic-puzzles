import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { useBoardDocument } from "./useBoardDocument";

const STARTING_FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";
const IMPORTED_FEN = "8/8/8/8/8/8/8/K6k b - - 0 23";

describe("useBoardDocument", () => {
  it("uses the FEN header when committing a complete PGN document", () => {
    const onCommitPgn = vi.fn();
    const pgn = `[Event "Imported analysis"]
[Variant "Atomic"]
[SetUp "1"]
[FEN "${IMPORTED_FEN}"]

23... Kh2 *`;
    const { result } = renderHook(() =>
      useBoardDocument({
        fen: STARTING_FEN,
        pgn: "",
        boardState: null,
        onCommitFen: vi.fn(),
        onCommitPgn,
      }),
    );

    act(() => {
      result.current.pgn.onFocus?.({} as FocusEvent<HTMLTextAreaElement>);
      result.current.pgn.onChange?.({ target: { value: pgn } } as ChangeEvent<HTMLTextAreaElement>);
      result.current.pgn.onBlur?.({
        currentTarget: { value: pgn },
      } as FocusEvent<HTMLTextAreaElement>);
    });

    expect(onCommitPgn).toHaveBeenCalledWith(pgn, IMPORTED_FEN);
    expect(result.current.fen.value).toBe(IMPORTED_FEN);
    expect(result.current.pgn.error).toBe("");
  });

  it("commits headerless moves on Enter, preserves Shift+Enter, and avoids a second commit on blur", () => {
    const onCommitPgn = vi.fn();
    const { result } = renderHook(() =>
      useBoardDocument({
        fen: STARTING_FEN,
        pgn: "",
        boardState: null,
        onCommitFen: vi.fn(),
        onCommitPgn,
      }),
    );

    act(() => {
      result.current.pgn.onFocus?.({} as FocusEvent<HTMLTextAreaElement>);
      result.current.pgn.onChange?.({
        target: { value: "Ka2 Kh2" },
      } as ChangeEvent<HTMLTextAreaElement>);
      const preventDefault = vi.fn();
      const event = {
        key: "Enter",
        shiftKey: true,
        currentTarget: { value: "Ka2 Kh2" },
        preventDefault,
      } as unknown as KeyboardEvent<HTMLTextAreaElement>;
      result.current.pgn.onKeyDown?.(event);
      expect(onCommitPgn).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
      result.current.pgn.onKeyDown?.({ ...event, shiftKey: false });
      result.current.pgn.onBlur?.({
        currentTarget: { value: "Ka2 Kh2" },
      } as FocusEvent<HTMLTextAreaElement>);
    });

    expect(onCommitPgn).toHaveBeenCalledExactlyOnceWith("Ka2 Kh2", undefined);
  });
});
