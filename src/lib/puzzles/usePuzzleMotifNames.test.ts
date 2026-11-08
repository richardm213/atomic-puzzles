import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { usePuzzleMotifNames } from "./usePuzzleMotifNames";

const auth = vi.hoisted(() => ({ username: "ExamplePlayer" }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: Boolean(auth.username),
    user: auth.username ? { username: auth.username } : null,
  }),
}));

afterEach(() => localStorage.clear());

it("syncs personal motif names across views and keeps them isolated by account", () => {
  const editor = renderHook(usePuzzleMotifNames);
  const viewer = renderHook(usePuzzleMotifNames);

  act(() => {
    expect(editor.result.current.saveName("fork", "  Double attack  ")).toBe(true);
  });
  expect(viewer.result.current.getName("fork")).toBe("Double attack");

  editor.unmount();
  auth.username = "OtherPlayer";
  viewer.rerender();
  expect(viewer.result.current.getName("fork")).toBe("Fork");

  auth.username = "";
  viewer.rerender();
  expect(viewer.result.current.getName("fork")).toBe("Fork");
  expect(viewer.result.current.canRename).toBe(false);

  auth.username = "exampleplayer";
  const reopened = renderHook(usePuzzleMotifNames);
  expect(reopened.result.current.getName("fork")).toBe("Double attack");

  act(() => {
    expect(reopened.result.current.saveName("fork", null)).toBe(true);
  });
  expect(reopened.result.current.getName("fork")).toBe("Fork");
});
