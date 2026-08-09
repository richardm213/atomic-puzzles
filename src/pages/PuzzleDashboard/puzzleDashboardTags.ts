import type { PuzzleMotif } from "../../lib/puzzles/puzzleMotifs";

export const entryMatchesSelectedTags = (entryTags: string[], selectedTags: string[]): boolean =>
  selectedTags.every((tag) => entryTags.includes(tag));

export const filterAvailablePuzzleMotifs = (
  motifs: PuzzleMotif[],
  selectedTags: string[],
  searchValue: string,
): PuzzleMotif[] => {
  const selectedTagSet = new Set(selectedTags);
  const query = searchValue.trim().toLocaleLowerCase();

  return motifs.filter((motif) => {
    if (selectedTagSet.has(motif.tag)) return false;
    if (!query) return true;

    return `${motif.name} ${motif.tag.replaceAll("_", " ")}`.toLocaleLowerCase().includes(query);
  });
};
