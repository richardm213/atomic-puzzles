import "./UsernamePickerModal.css";

import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { appAssetPath } from "../../utils/appAssetPath";

type UsernamePickerModalProps = {
  id: string;
  title: string;
  recentUsernames: string[];
  selectedUsernames?: string[];
  maxSelectedUsernames?: number;
  submitLabel?: string;
  showSelectedUsernames?: boolean;
  onClose: () => void;
  onSelectUsername: (username: string) => void;
  onRemoveRecentUsername: (username: string) => void;
  onRemoveSelectedUsername?: (username: string) => void;
};

const containsUsername = (usernames: string[], username: string): boolean =>
  usernames.some((currentUsername) => currentUsername.toLowerCase() === username.toLowerCase());

let openingPlayersRequest: Promise<string[]> | null = null;

const loadOpeningPlayers = (): Promise<string[]> => {
  if (openingPlayersRequest) return openingPlayersRequest;

  openingPlayersRequest = fetch(appAssetPath("/api/opening-players"), {
    headers: { "X-Explorer-Intent": "visible" },
  })
    .then(async (response) => {
      const data = (await response.json()) as { players?: string[]; error?: string };
      if (!response.ok || !Array.isArray(data.players)) {
        throw new Error(data.error || "Could not load opening database players");
      }
      return data.players;
    })
    .catch((error) => {
      openingPlayersRequest = null;
      throw error;
    });

  return openingPlayersRequest;
};

export const UsernamePickerModal = ({
  id,
  title,
  recentUsernames,
  selectedUsernames = [],
  maxSelectedUsernames = 1,
  submitLabel = "Select",
  showSelectedUsernames = false,
  onClose,
  onSelectUsername,
  onRemoveRecentUsername,
  onRemoveSelectedUsername,
}: UsernamePickerModalProps) => {
  const [usernameDraft, setUsernameDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"recent" | "database">("recent");
  const [openingPlayers, setOpeningPlayers] = useState<string[]>([]);
  const [openingPlayersStatus, setOpeningPlayersStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [openingPlayersError, setOpeningPlayersError] = useState("");
  const canSelectMore =
    maxSelectedUsernames === 1 || selectedUsernames.length < maxSelectedUsernames;
  const trimmedDraft = usernameDraft.trim();
  const filteredOpeningPlayers = useMemo(() => {
    const query = trimmedDraft.toLowerCase();
    if (!query) return openingPlayers;
    return openingPlayers.filter((username) => username.toLowerCase().includes(query));
  }, [openingPlayers, trimmedDraft]);

  useEffect(() => {
    if (activeTab !== "database") return;

    let cancelled = false;
    setOpeningPlayersStatus("loading");
    loadOpeningPlayers()
      .then((players) => {
        if (cancelled) return;
        setOpeningPlayers(players);
        setOpeningPlayersStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setOpeningPlayersError(
          error instanceof Error ? error.message : "Could not load opening database players",
        );
        setOpeningPlayersStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const submitUsername = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!trimmedDraft || !canSelectMore) return;

    onSelectUsername(trimmedDraft);
    setUsernameDraft("");
  };

  return (
    <div
      className="analysisUsernamePickerBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="analysisUsernamePicker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <button
          type="button"
          className="analysisUsernamePickerClose"
          aria-label="Close username picker"
          onClick={onClose}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
        <h2 id={id}>{title}</h2>
        <form className="analysisUsernamePickerForm" onSubmit={submitUsername}>
          <input
            type="text"
            value={usernameDraft}
            placeholder={canSelectMore ? "Search by username" : "Selection limit reached"}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            disabled={!canSelectMore}
            onChange={(event) => setUsernameDraft(event.target.value)}
          />
          <button
            type="submit"
            className="analysisUsernamePickerSubmit"
            aria-label={`${submitLabel} ${trimmedDraft || "username"}`}
            title={`${submitLabel} username`}
            disabled={!trimmedDraft || !canSelectMore}
          >
            <FontAwesomeIcon icon={faCheck} />
          </button>
        </form>
        {showSelectedUsernames && selectedUsernames.length ? (
          <div className="usernamePickerSelectedBlock">
            <div className="usernamePickerSelectedHeader">
              <span>Selected players</span>
              <small>
                {selectedUsernames.length}/{maxSelectedUsernames}
              </small>
            </div>
            <div className="usernamePickerSelectedUsers" aria-label="Selected practice players">
              {selectedUsernames.map((selectedUsername) => (
                <span className="usernamePickerSelectedChip" key={selectedUsername}>
                  <span>{selectedUsername}</span>
                  {onRemoveSelectedUsername ? (
                    <button
                      type="button"
                      aria-label={`Remove ${selectedUsername}`}
                      onClick={() => onRemoveSelectedUsername(selectedUsername)}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {!canSelectMore ? (
          <small className="usernamePickerLimitNote">
            Up to {maxSelectedUsernames} {maxSelectedUsernames === 1 ? "user" : "users"} can be
            selected at once.
          </small>
        ) : null}
        <div className="usernamePickerTabs" role="tablist" aria-label="Player source">
          <button
            type="button"
            role="tab"
            className={activeTab === "recent" ? "active" : ""}
            aria-selected={activeTab === "recent"}
            onClick={() => setActiveTab("recent")}
          >
            Recent
          </button>
          <button
            type="button"
            role="tab"
            className={activeTab === "database" ? "active" : ""}
            aria-selected={activeTab === "database"}
            onClick={() => setActiveTab("database")}
          >
            All Players
          </button>
        </div>
        {activeTab === "recent" && recentUsernames.length ? (
          <div className="analysisRecentUsernameGrid" aria-label="Recent username searches">
            {recentUsernames.map((recentUsername) => {
              const isSelected = containsUsername(selectedUsernames, recentUsername);
              const isDisabled = !canSelectMore && !isSelected;

              return (
                <span className="analysisRecentUsernameChip" key={recentUsername}>
                  <button
                    type="button"
                    className={isSelected ? "active" : ""}
                    disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      onSelectUsername(recentUsername);
                    }}
                  >
                    {recentUsername}
                  </button>
                  <button
                    type="button"
                    className="remove"
                    aria-label={`Remove ${recentUsername} from recent searches`}
                    onClick={() => onRemoveRecentUsername(recentUsername)}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
        {activeTab === "recent" && recentUsernames.length === 0 ? (
          <div className="usernamePickerListState">No recent players.</div>
        ) : null}
        {activeTab === "database" ? (
          <div className="usernamePickerDatabasePanel">
            {openingPlayersStatus === "loading" ? (
              <div className="usernamePickerListState">Loading opening database players...</div>
            ) : null}
            {openingPlayersStatus === "error" ? (
              <div className="usernamePickerListState error" role="alert">
                {openingPlayersError}
              </div>
            ) : null}
            {openingPlayersStatus === "ready" ? (
              <>
                <div className="usernamePickerDatabaseCount">
                  {filteredOpeningPlayers.length === openingPlayers.length
                    ? `${openingPlayers.length} players`
                    : `${filteredOpeningPlayers.length} of ${openingPlayers.length} players`}
                </div>
                <div className="usernamePickerDatabaseList" aria-label="Opening database players">
                  {filteredOpeningPlayers.map((username) => {
                    const isSelected = containsUsername(selectedUsernames, username);
                    const isDisabled = !canSelectMore && !isSelected;
                    return (
                      <button
                        type="button"
                        className={isSelected ? "active" : ""}
                        disabled={isDisabled}
                        key={username}
                        onClick={() => {
                          if (!isDisabled) onSelectUsername(username);
                        }}
                      >
                        {username}
                      </button>
                    );
                  })}
                </div>
                {filteredOpeningPlayers.length === 0 ? (
                  <div className="usernamePickerListState">No matching opening players.</div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
};
