import { act, renderHook } from "@testing-library/react";

import { useUsernamePicker } from "./useUsernamePicker";

it("closes an open username picker on Escape", () => {
  const { result } = renderHook(() => useUsernamePicker("player"));

  act(() => result.current.open());
  expect(result.current.isOpen).toBe(true);

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(result.current.isOpen).toBe(false);
});
