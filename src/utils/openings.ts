const openingDisplayLabels: Record<string, string> = {
  "nf3 e3": "Nf3 e3",
  "nf3 e4": "Nf3 e4",
  e4: "e4",
  d4: "d4",
  "2n": "2N",
  "2n h3": "2N h3",
  nh3: "Nh3",
  "nh3 d4": "Nh3 d4",
  "nh3 e4": "Nh3 e4",
  "nh3 e3": "Nh3 e3",
  "nh3 na3": "Nh3 Na3",
  nc3: "Nc3",
  na3: "Na3",
  "nf3 d4": "Nf3 d4",
  "nf3 nd4": "Nf3 Nd4",
  "nf3 c3": "Nf3 c3",
  "e3 nc3": "e3 Nc3",
  "e3 qh5": "e3 Qh5",
  "e3 qf3": "e3 Qf3",
  "e3 f4": "e3 f4",
  "nh3 nc3": "Nh3 Nc3",
  variety: "All-around",
};

export const normalizeOpeningKey = (opening: string): string =>
  String(opening || "")
    .trim()
    .toLowerCase();

export const getOpeningDisplayLabel = (opening: string): string => {
  const normalizedOpening = normalizeOpeningKey(opening);
  return openingDisplayLabels[normalizedOpening] ?? String(opening || "").trim();
};
