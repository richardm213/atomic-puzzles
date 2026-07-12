import "./UsernamePickerModal.css";

import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type FormEvent, useState } from "react";

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
  const canSelectMore =
    maxSelectedUsernames === 1 || selectedUsernames.length < maxSelectedUsernames;
  const trimmedDraft = usernameDraft.trim();

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
        {recentUsernames.length ? (
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
      </section>
    </div>
  );
};
