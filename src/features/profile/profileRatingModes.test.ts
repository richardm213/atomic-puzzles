import { describe, expect, it } from "vitest";

import { createModeRecord, type Mode } from "../../constants/matches";
import type { RatingDisplayByMode } from "../../hooks/usePlayerProfileData";
import { getVisibleProfileRatingModes } from "./profileRatingModes";

const ratings = (games: Partial<Record<Mode, number>>): RatingDisplayByMode =>
  createModeRecord((mode) => ({
    currentRating: 2100,
    peakRating: 2200,
    peakDate: "2026-01-01",
    currentRd: 40,
    gamesPlayed: games[mode] ?? 0,
    rank: null,
    topWins: [],
  }));

describe("getVisibleProfileRatingModes", () => {
  it("uses the highest-volume remaining optional pool for the fourth row", () => {
    expect(
      getVisibleProfileRatingModes(
        ratings({ blitz: 100, bullet: 90, hyperbullet: 80, rapid: 20, atomic960: 10 }),
      ),
    ).toEqual(["blitz", "bullet", "hyperbullet", "rapid"]);
  });

  it("uses the highest-volume replacement when only one pool can be displaced", () => {
    expect(
      getVisibleProfileRatingModes(
        ratings({
          blitz: 100,
          bullet: 90,
          hyperbullet: 20,
          rapid: 30,
          wolfrandom: 40,
          atomic960: 35,
        }),
      ),
    ).toEqual(["blitz", "bullet", "wolfrandom", "atomic960"]);
  });

  it("can replace all three standard pools", () => {
    expect(
      getVisibleProfileRatingModes(
        ratings({
          blitz: 30,
          bullet: 20,
          hyperbullet: 10,
          rapid: 60,
          wolfrandom: 50,
          atomic960: 40,
        }),
      ),
    ).toEqual(["rapid", "wolfrandom", "atomic960"]);
  });

  it("does not show rows for pools without games", () => {
    expect(getVisibleProfileRatingModes(ratings({ blitz: 100, bullet: 90 }))).toEqual([
      "blitz",
      "bullet",
    ]);
  });

  it("persists explicit slot choices while replacing unavailable choices", () => {
    expect(
      getVisibleProfileRatingModes(ratings({ blitz: 100, bullet: 90, rapid: 30, atomic960: 20 }), [
        "rapid",
        "wolfrandom",
        "bullet",
        "atomic960",
      ]),
    ).toEqual(["rapid", "blitz", "bullet", "atomic960"]);
  });

  it("keeps slot choices unique", () => {
    expect(
      getVisibleProfileRatingModes(
        ratings({ blitz: 100, bullet: 90, hyperbullet: 80, rapid: 30 }),
        ["rapid", "rapid", "rapid", "rapid"],
      ),
    ).toEqual(["rapid", "blitz", "bullet"]);
  });
});
