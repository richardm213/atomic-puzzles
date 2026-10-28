import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useRef, useState } from "react";

import { getPuzzleMotifParent, puzzleMotifs } from "../../lib/puzzles/puzzleMotifs";
import type { AsyncActionStatus } from "../../types/async";
import { getErrorMessage } from "../../utils/errors";

type SaveStatus = AsyncActionStatus;

export const PuzzleMotifsPanel = ({
  visible,
  tags,
  canManage,
  onUpdate,
}: {
  visible: boolean;
  tags: string[];
  canManage: boolean;
  onUpdate: (tags: string[]) => Promise<void>;
}) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle" });
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const selectedMotif = useMemo(
    () => puzzleMotifs.find((motif) => motif.tag === selectedTag) ?? null,
    [selectedTag],
  );
  const availableMotifs = puzzleMotifs.filter((motif) => !tags.includes(motif.tag));
  const normalizedSearch = searchValue.trim().toLocaleLowerCase();
  const matchingMotifs = normalizedSearch
    ? availableMotifs
        .filter((motif) =>
          `${motif.name} ${motif.tag.replaceAll("_", " ")}`
            .toLocaleLowerCase()
            .includes(normalizedSearch),
        )
        .sort((first, second) => {
          const firstStartsWith = first.name.toLocaleLowerCase().startsWith(normalizedSearch);
          const secondStartsWith = second.name.toLocaleLowerCase().startsWith(normalizedSearch);
          return Number(secondStartsWith) - Number(firstStartsWith);
        })
        .slice(0, 5)
    : [];
  const saving = saveStatus.state === "saving";

  useEffect(() => {
    if (!selectedMotif) return undefined;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();

    const close = () => setSelectedTag(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const handleDialogClick = (event: MouseEvent) => {
      if (event.target === dialog) close();
    };
    window.addEventListener("keydown", handleKeyDown);
    dialog?.addEventListener("click", handleDialogClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      dialog?.removeEventListener("click", handleDialogClick);
      if (dialog?.open) dialog.close();
    };
  }, [selectedMotif]);

  if (!visible) return null;

  const saveTags = async (nextTags: string[]): Promise<boolean> => {
    if (!canManage || saving) return false;
    setSaveStatus({ state: "saving" });
    try {
      await onUpdate(nextTags);
      setSaveStatus({ state: "saved" });
      return true;
    } catch (error) {
      setSaveStatus({
        state: "error",
        message: getErrorMessage(error, "Unable to update puzzle motifs."),
      });
      return false;
    }
  };

  const addMotif = async (tag: string) => {
    if (await saveTags([...tags, tag])) {
      setSearchValue("");
      setEditorOpen(false);
    }
  };

  const subtags = selectedMotif
    ? puzzleMotifs.filter((motif) => motif.parentTag === selectedMotif.tag)
    : [];
  const canConvert = Boolean(
    selectedMotif && canManage && tags.includes(selectedMotif.tag) && subtags.length > 0,
  );

  return (
    <>
      <section className="puzzleMotifsPanel" aria-label="Puzzle tags">
        <div className="puzzleMotifsHeader">
          <div>
            <span>Tags</span>
          </div>
        </div>

        <div className="puzzleMotifAppliedList" aria-label="Tags on this puzzle" aria-busy={saving}>
          {tags.length > 0 ? (
            tags.map((tag) => {
              const motif = puzzleMotifs.find((entry) => entry.tag === tag);
              return (
                <div className="puzzleMotifAppliedTag" key={tag}>
                  <button
                    type="button"
                    className="puzzleMotifDefinitionButton"
                    aria-label={`View definition for ${motif?.name ?? tag}`}
                    onClick={() => setSelectedTag(tag)}
                  >
                    {motif?.name ?? tag}
                  </button>
                </div>
              );
            })
          ) : (
            <em>No tags yet.</em>
          )}
        </div>

        {canManage ? (
          <button
            type="button"
            className="puzzleMotifsAddButton"
            aria-expanded={editorOpen}
            disabled={saving || availableMotifs.length === 0}
            onClick={() => {
              if (editorOpen) setSearchValue("");
              setEditorOpen(!editorOpen);
              setSaveStatus({ state: "idle" });
            }}
          >
            <span aria-hidden="true">{editorOpen ? "−" : "+"}</span>
            {editorOpen ? "Close tag picker" : "Add tag"}
          </button>
        ) : null}

        {editorOpen && canManage ? (
          <div className="puzzleMotifPicker" role="region" aria-label="Add puzzle tag">
            <input
              type="search"
              aria-label="Search tags to add"
              placeholder="Type a tag name"
              autoFocus
              value={searchValue}
              disabled={saving}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchValue("");
                  setEditorOpen(false);
                }
                if (event.key === "Enter" && matchingMotifs[0]) {
                  event.preventDefault();
                  void addMotif(matchingMotifs[0].tag);
                }
              }}
            />
            {normalizedSearch ? (
              <div className="puzzleMotifSearchResults" aria-label="Matching tags">
                {matchingMotifs.length > 0 ? (
                  matchingMotifs.map((motif) => {
                    const parentMotif = getPuzzleMotifParent(motif);
                    return (
                      <button
                        key={motif.tag}
                        type="button"
                        aria-label={`Add ${motif.tag}`}
                        disabled={saving}
                        onClick={() => void addMotif(motif.tag)}
                      >
                        <span>{motif.name}</span>
                        {parentMotif ? <small>{parentMotif.name}</small> : null}
                      </button>
                    );
                  })
                ) : (
                  <p>No tags found.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {saveStatus.state === "saving" ? (
          <p className="puzzleMotifsMessage" role="status">
            Updating tags…
          </p>
        ) : null}
        {saveStatus.state === "saved" ? (
          <p className="puzzleMotifsMessage success" role="status">
            Tags updated.
          </p>
        ) : null}
        {saveStatus.state === "error" ? (
          <p className="puzzleMotifsMessage error" role="alert">
            {saveStatus.message}
          </p>
        ) : null}
      </section>

      {selectedMotif ? (
        <dialog
          ref={dialogRef}
          className="puzzleMotifDefinitionDialog"
          aria-labelledby="puzzle-motif-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            setSelectedTag(null);
          }}
        >
          <div className="puzzleMotifDefinitionCard">
            <div className="puzzleMotifDefinitionHeading">
              <h2 id="puzzle-motif-dialog-title">{selectedMotif.name}</h2>
              <div className="puzzleMotifDefinitionActions">
                {canManage && tags.includes(selectedMotif.tag) ? (
                  <button
                    type="button"
                    className="puzzleMotifDefinitionRemove"
                    aria-label={`Remove ${selectedMotif.tag}`}
                    title={`Remove ${selectedMotif.name}`}
                    disabled={saving}
                    onClick={async () => {
                      if (await saveTags(tags.filter((tag) => tag !== selectedMotif.tag))) {
                        setSelectedTag(null);
                      }
                    }}
                  >
                    <span aria-hidden="true">−</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="puzzleMotifDefinitionClose"
                  onClick={() => setSelectedTag(null)}
                  aria-label="Close tag definition"
                >
                  <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                </button>
              </div>
            </div>
            <p>{selectedMotif.description}</p>
            {canConvert ? (
              <div className="puzzleMotifConversions">
                <strong>Convert to a subtag</strong>
                <div>
                  {subtags.map((subtag) => (
                    <button
                      key={subtag.tag}
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        const nextTags = [
                          ...new Set(
                            tags.map((tag) => (tag === selectedMotif.tag ? subtag.tag : tag)),
                          ),
                        ];
                        if (await saveTags(nextTags)) setSelectedTag(null);
                      }}
                    >
                      {subtag.name}
                    </button>
                  ))}
                </div>
                {saving ? <span role="status">Updating tag…</span> : null}
                {saveStatus.state === "error" ? (
                  <span className="error" role="alert">
                    {saveStatus.message}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </>
  );
};
