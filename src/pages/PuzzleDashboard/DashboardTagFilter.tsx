import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useRef, useState } from "react";

import { puzzleMotifs } from "../../lib/puzzles/puzzleMotifs";
import { filterAvailablePuzzleMotifs } from "./puzzleDashboardTags";

type DashboardTagFilterProps = {
  disabled: boolean;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
};

const motifNames = new Map(puzzleMotifs.map((motif) => [motif.tag, motif.name]));

export const getPuzzleTagName = (tag: string): string => motifNames.get(tag) ?? tag;

export const DashboardTagFilter = ({
  disabled,
  selectedTags,
  onChange,
}: DashboardTagFilterProps) => {
  const [searchValue, setSearchValue] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const availableMotifs = useMemo(
    () => filterAvailablePuzzleMotifs(puzzleMotifs, selectedTags, searchValue),
    [searchValue, selectedTags],
  );

  const addTag = (tag: string): void => {
    onChange([...selectedTags, tag]);
    setSearchValue("");
    setIsPickerOpen(true);
  };

  const removeTag = (tag: string): void => {
    onChange(selectedTags.filter((selectedTag) => selectedTag !== tag));
  };

  return (
    <div
      ref={rootRef}
      className="dashboardTagFilter dashboardFilterSearch"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) setIsPickerOpen(false);
      }}
    >
      <span className="dashboardTagFilterLabel">Tags (match all)</span>
      {selectedTags.length > 0 ? (
        <div className="dashboardSelectedTags" aria-label="Selected tags">
          {selectedTags.map((tag) => (
            <span key={tag} className="dashboardSelectedTag">
              {getPuzzleTagName(tag)}
              <button
                type="button"
                aria-label={`Remove ${getPuzzleTagName(tag)} tag`}
                title={`Remove ${getPuzzleTagName(tag)}`}
                onClick={() => removeTag(tag)}
                disabled={disabled}
              >
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="dashboardTagSearchControl">
        <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search tags to add"
          aria-controls="dashboard-tag-options"
          placeholder={selectedTags.length > 0 ? "Add another tag" : "Search tags"}
          value={searchValue}
          onFocus={() => setIsPickerOpen(true)}
          onChange={(event) => {
            setSearchValue(event.target.value);
            setIsPickerOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsPickerOpen(false);
            const onlyAvailableMotif =
              availableMotifs.length === 1 ? availableMotifs[0] : undefined;
            if (event.key === "Enter" && onlyAvailableMotif) {
              event.preventDefault();
              addTag(onlyAvailableMotif.tag);
            }
          }}
          disabled={disabled}
        />
      </div>
      {isPickerOpen && !disabled ? (
        <div id="dashboard-tag-options" className="dashboardTagOptions">
          {availableMotifs.length > 0 ? (
            availableMotifs.map((motif) => (
              <button
                key={motif.tag}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(motif.tag)}
              >
                <span>{motif.name}</span>
                <small>{motif.tag}</small>
              </button>
            ))
          ) : (
            <p>
              {selectedTags.length === puzzleMotifs.length
                ? "All tags selected."
                : "No tags found."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};
