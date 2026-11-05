import { boardSoundEventForMove, isBoardSoundSet } from "./boardSounds";

describe("boardSounds", () => {
  it("uses the atomic explosion cue for captures", () => {
    expect(boardSoundEventForMove({ san: "Rxe7+", isCheck: true })).toBe("explosion");
  });

  it("uses the check cue for non-capturing checks", () => {
    expect(boardSoundEventForMove({ san: "Qh5+", isCheck: true })).toBe("check");
  });

  it("accepts only supported sound sets", () => {
    expect(isBoardSoundSet("piano")).toBe(true);
    expect(isBoardSoundSet("silent")).toBe(false);
  });
});
