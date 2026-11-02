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
  it("keeps optional pools hidden when they do not outplay a standard pool", () => {
    expect(
      getVisibleProfileRatingModes(
        ratings({ blitz: 100, bullet: 90, hyperbullet: 80, rapid: 80 }),
        {},
      ),
    ).toEqual(["blitz", "bullet", "hyperbullet"]);
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
        {},
      ),
    ).toEqual(["blitz", "bullet", "wolfrandom"]);
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
        {},
      ),
    ).toEqual(["rapid", "wolfrandom", "atomic960"]);
  });

  it("also shows an explicitly enabled optional pool", () => {
    expect(
      getVisibleProfileRatingModes(
        ratings({ blitz: 100, bullet: 90, hyperbullet: 80, rapid: 10 }),
        { rapid: true },
      ),
    ).toEqual(["blitz", "bullet", "hyperbullet", "rapid"]);
  });
});
