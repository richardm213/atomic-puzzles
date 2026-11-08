import "./PuzzleTagVotingPanel.css";

import { faCheck, faClock, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";

import {
  getPuzzleTagStatus,
  type PuzzleTagTally,
  type PuzzleTagVote,
} from "../../../shared/domain/puzzles/puzzleTagVotes";
import {
  getMostSpecificPuzzleMotifTags,
  type PuzzleMotif,
  puzzleMotifs,
} from "../../lib/puzzles/puzzleMotifs";
import { loadPuzzleTagVotes, voteOnPuzzleTag } from "../../lib/puzzles/puzzleTags";
import { usePuzzleMotifNames } from "../../lib/puzzles/usePuzzleMotifNames";
import type { AsyncActionStatus } from "../../types/async";
import { getErrorMessage } from "../../utils/errors";
import { PuzzleMotifRename } from "../PuzzleMotifRename/PuzzleMotifRename";

const motifsByTag = new Map(puzzleMotifs.map((motif) => [motif.tag, motif]));
const emptyTally = (tag: string): PuzzleTagTally => ({ tag, up: 0, down: 0, vote: 0 });
const directions = [1, -1] as const;

const getVisiblePuzzleTags = (tags: string[], tallies: PuzzleTagTally[] | null) => {
  if (!tallies) return getMostSpecificPuzzleMotifTags(tags);
  const positiveTags = new Set(
    tallies.filter((tally) => getPuzzleTagStatus(tally) !== "hidden").map(({ tag }) => tag),
  );
  // Preserve the already loaded tag order while adding newly visible motifs.
  return getMostSpecificPuzzleMotifTags(
    [...new Set([...tags, ...positiveTags])].filter((tag) => positiveTags.has(tag)),
  );
};

const VoteButtons = ({
  name,
  tally,
  disabled,
  canVote,
  onVote,
}: {
  name: string;
  tally: PuzzleTagTally;
  disabled: boolean;
  canVote: boolean;
  onVote: (tag: string, direction: PuzzleTagVote) => void;
}) => (
  <span className="puzzleTagVoteVoteButtons">
    {directions.map((direction) => {
      const isUp = direction === 1;
      const label = isUp ? "Upvote" : "Downvote";
      const count = isUp ? tally.up : tally.down;
      const selected = tally.vote === direction;
      const score = `${isUp ? "+" : "−"}${count}`;
      const accessibleCount = `${count} weighted ${label.toLowerCase()}${count === 1 ? "" : "s"}`;
      return canVote ? (
        <button
          type="button"
          key={direction}
          aria-label={`${label} ${name} (${accessibleCount})`}
          aria-pressed={selected}
          aria-disabled={disabled}
          onClick={() => {
            if (!disabled) onVote(tally.tag, selected ? 0 : direction);
          }}
        >
          {score}
        </button>
      ) : (
        <span key={direction} aria-label={accessibleCount}>
          {score}
        </span>
      );
    })}
  </span>
);

export const PuzzleTagVotingPanel = ({
  puzzleId,
  tags,
  canVote,
}: {
  puzzleId: number;
  tags: string[];
  canVote: boolean;
}) => {
  const [tallies, setTallies] = useState<PuzzleTagTally[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AsyncActionStatus>({ state: "idle" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const saveInFlight = useRef(false);
  const { getName, canRename } = usePuzzleMotifNames();
  const selectedMotif = selectedTag ? motifsByTag.get(selectedTag) : null;
  const talliesByTag = new Map(tallies?.map((tally) => [tally.tag, tally]));
  const visibleTags = getVisiblePuzzleTags(tags, tallies);
  const saving = saveStatus.state === "saving";
  const normalizedSearch = searchValue.trim().toLowerCase();
  const matchingMotifs = pickerOpen
    ? puzzleMotifs
        .filter(({ name, tag }) =>
          [name, tag.replaceAll("_", " "), getName(tag)].some((value) =>
            value.toLowerCase().includes(normalizedSearch),
          ),
        )
        .sort((first, second) => {
          const firstName = getName(first.tag);
          const secondName = getName(second.tag);
          const priority = (name: string) =>
            Number(name.toLowerCase().startsWith(normalizedSearch));
          return priority(secondName) - priority(firstName) || firstName.localeCompare(secondName);
        })
    : [];

  useEffect(() => {
    const controller = new AbortController();
    void loadPuzzleTagVotes(puzzleId, controller.signal)
      .then((votes) => {
        if (!controller.signal.aborted) setTallies(votes);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(getErrorMessage(error, "Unable to load puzzle tag votes."));
        }
      });
    return () => controller.abort();
  }, [puzzleId, loadVersion]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!selectedMotif || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [selectedMotif]);

  useEffect(() => {
    if (saveStatus.state !== "saved") return;
    const timer = window.setTimeout(() => setSaveStatus({ state: "idle" }), 3500);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const castVote = async (tag: string, direction: PuzzleTagVote) => {
    if (!canVote || !tallies || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaveStatus({ state: "saving" });
    try {
      const votes = await voteOnPuzzleTag(puzzleId, tag, direction);
      const focusedTag =
        document.activeElement?.closest<HTMLElement>("[data-motif-chip]")?.dataset.motifChip;
      if (focusedTag && !getVisiblePuzzleTags(tags, votes).includes(focusedTag)) {
        pickerButtonRef.current?.focus();
      }
      setTallies(votes);
      setSaveStatus({ state: "saved" });
    } catch (error) {
      setSaveStatus({
        state: "error",
        message: getErrorMessage(error, "Unable to save your tag vote."),
      });
    } finally {
      saveInFlight.current = false;
    }
  };

  const voteControls = (motif: PuzzleMotif) => (
    <VoteButtons
      name={getName(motif.tag)}
      tally={talliesByTag.get(motif.tag) ?? emptyTally(motif.tag)}
      disabled={saving || !tallies}
      canVote={canVote}
      onVote={(tag, direction) => void castVote(tag, direction)}
    />
  );

  const closePicker = () => {
    setPickerOpen(false);
    setSearchValue("");
    pickerButtonRef.current?.focus();
  };
  const closeDialog = () => {
    dialogRef.current?.close();
    const trigger = dialogTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
    else pickerButtonRef.current?.focus();
    setSelectedTag(null);
  };
  const feedback =
    saveStatus.state === "error" ? (
      <p className="puzzleTagVotesMessage error" role="alert">
        {saveStatus.message}
      </p>
    ) : (
      <p className="puzzleTagVotesMessage" role="status">
        {saving ? "Saving vote…" : saveStatus.state === "saved" ? "Vote saved." : ""}
      </p>
    );

  return (
    <>
      <section className="puzzleTagVotesPanel" aria-label="Puzzle tags">
        <div className="puzzleTagVotesHeader">
          <span>Tags</span>
        </div>
        <div className="puzzleTagVoteAppliedList" aria-label="Tags on this puzzle">
          <div className="puzzleTagVoteChips">
            {visibleTags.map((tag) => {
              const motif = motifsByTag.get(tag);
              if (!motif) return null;
              const name = getName(tag);
              const tally = talliesByTag.get(tag);
              const status = tally ? getPuzzleTagStatus(tally) : undefined;
              return (
                <div
                  className="puzzleTagVoteAppliedTag"
                  key={tag}
                  data-motif-chip={tag}
                  data-status={status}
                >
                  <button
                    type="button"
                    className="puzzleTagVoteDefinitionButton"
                    aria-label={`View definition for ${name}${status ? ` (${status})` : ""}`}
                    onClick={(event) => {
                      dialogTriggerRef.current = event.currentTarget;
                      setSelectedTag(tag);
                    }}
                  >
                    {status ? (
                      <FontAwesomeIcon
                        icon={status === "confirmed" ? faCheck : faClock}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span>{name}</span>
                  </button>
                  {tally ? (
                    <div className="puzzleTagVoteHoverVotes">{voteControls(motif)}</div>
                  ) : null}
                </div>
              );
            })}
            {visibleTags.length === 0 && !canVote ? <em>No tags yet.</em> : null}
          </div>
          {canVote ? (
            <button
              ref={pickerButtonRef}
              type="button"
              className="puzzleTagVotesAddButton"
              aria-expanded={pickerOpen}
              onClick={() => {
                if (pickerOpen) closePicker();
                else setPickerOpen(true);
              }}
            >
              {pickerOpen ? "Close tag picker" : "Vote on tags"}
            </button>
          ) : null}
        </div>

        {pickerOpen ? (
          <div className="puzzleTagVotePicker" role="region" aria-label="Vote on any tag">
            <input
              type="search"
              aria-label="Search tags"
              placeholder="Search tags"
              autoFocus
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closePicker();
              }}
            />
            {tallies ? (
              <ul className="puzzleTagVoteSearchResults" aria-label="Matching tags">
                {matchingMotifs.map((motif) => (
                  <li key={motif.tag}>
                    <button
                      type="button"
                      className="puzzleTagVotePickerName"
                      onClick={(event) => {
                        dialogTriggerRef.current = event.currentTarget;
                        setSelectedTag(motif.tag);
                      }}
                    >
                      {getName(motif.tag)}
                      {talliesByTag.has(motif.tag) && !visibleTags.includes(motif.tag) ? (
                        <small>
                          {getPuzzleTagStatus(
                            talliesByTag.get(motif.tag) ?? emptyTally(motif.tag),
                          ) === "hidden"
                            ? "Hidden"
                            : "Subtag shown"}
                        </small>
                      ) : null}
                    </button>
                    {voteControls(motif)}
                  </li>
                ))}
                {matchingMotifs.length === 0 ? <li>No tags found.</li> : null}
              </ul>
            ) : !loadError ? (
              <p role="status">Loading votes…</p>
            ) : null}
          </div>
        ) : null}

        {loadError ? (
          <p className="puzzleTagVotesMessage error" role="alert">
            {loadError}
            <button
              type="button"
              className="puzzleTagVoteRetry"
              onClick={() => {
                setLoadError("");
                setLoadVersion((version) => version + 1);
              }}
            >
              Retry
            </button>
          </p>
        ) : null}
        {!selectedMotif ? feedback : null}
      </section>

      {selectedMotif ? (
        <dialog
          ref={dialogRef}
          className="puzzleTagVoteDefinitionDialog"
          aria-labelledby="puzzle-motif-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
        >
          <div className="puzzleTagVoteDefinitionCard">
            <div className="puzzleTagVoteDefinitionHeading">
              <h2 id="puzzle-motif-dialog-title">{getName(selectedMotif.tag)}</h2>
              <div className="puzzleTagVoteDefinitionActions">
                {canRename ? (
                  <PuzzleMotifRename motif={selectedMotif} name={getName(selectedMotif.tag)} />
                ) : null}
                <button
                  type="button"
                  className="puzzleTagVoteDefinitionClose"
                  onClick={closeDialog}
                  aria-label="Close tag definition"
                >
                  <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                </button>
              </div>
            </div>
            <p>{selectedMotif.description}</p>
            {tallies ? (
              <div className="puzzleTagVoteDialogVotes">
                <strong>
                  {
                    {
                      confirmed: "Confirmed",
                      unconfirmed: "Unconfirmed",
                      hidden: "Hidden",
                    }[
                      getPuzzleTagStatus(
                        talliesByTag.get(selectedMotif.tag) ?? emptyTally(selectedMotif.tag),
                      )
                    ]
                  }
                </strong>
                {voteControls(selectedMotif)}
                {!canVote ? <span>Log in to vote.</span> : null}
              </div>
            ) : (
              <span role="status">{loadError || "Loading votes…"}</span>
            )}
            {feedback}
          </div>
        </dialog>
      ) : null}
    </>
  );
};
