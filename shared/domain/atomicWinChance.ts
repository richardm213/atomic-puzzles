// Keep the logistic curve symmetric around 0.00 = 50%, with +3.00 = 62%.
const SLOPE_PER_CENTIPAWN = Math.log(62 / 38) / 300;

export const atomicWinChance = (centipawns: number): number =>
  1 / (1 + Math.exp(-SLOPE_PER_CENTIPAWN * centipawns));
