export const lichessAtomicAnalysisUrl = (fen: string | null | undefined): string => {
  if (!fen) return "https://lichess.org/analysis/atomic";
  return `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;
};
