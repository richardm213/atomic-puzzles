import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";

import { useAppSettings } from "../../context/AppSettings";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  formatKeyboardBinding,
  keyboardBindingFromEvent,
  type KeyboardShortcutAction,
  keyboardShortcutActions,
  keyboardShortcutDefinitions,
} from "../../lib/keyboardShortcuts";

export const KeyboardShortcutSettings = ({ onBack }: { onBack: () => void }) => {
  const { keyboardShortcuts, setKeyboardShortcuts } = useAppSettings();
  const [recording, setRecording] = useState<KeyboardShortcutAction | null>(null);
  const [error, setError] = useState("");
  const conflict = (action: KeyboardShortcutAction, keys: string[]) =>
    keyboardShortcutActions.find(
      (other) =>
        other !== action &&
        keyboardShortcuts.bindings[other].enabled &&
        keyboardShortcuts.bindings[other].keys.some((key) => keys.includes(key)),
    );
  return (
    <div className="navSettingsKeyboardPage">
      <div className="navSettingsPageHeader">
        <button
          className="navSettingsBackButton"
          type="button"
          onClick={onBack}
          aria-label="Back to site settings"
        >
          <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
        </button>
        <span>Keyboard shortcuts</span>
      </div>
      <div className="navSettingsSection navSettingsStack">
        <label className="navSettingsCheckbox">
          <span>Enable keyboard shortcuts</span>
          <input
            type="checkbox"
            checked={keyboardShortcuts.enabled}
            onChange={(event) =>
              setKeyboardShortcuts((current) => ({ ...current, enabled: event.target.checked }))
            }
          />
        </label>
      </div>
      <p className="navShortcutInstructions">Select a binding and press the new keys.</p>
      {error ? (
        <p className="navShortcutError" role="alert">
          {error}
        </p>
      ) : null}
      {[
        ...new Set(
          keyboardShortcutActions.map((action) => keyboardShortcutDefinitions[action].section),
        ),
      ].map((section) => (
        <section
          className="navSettingsSection navShortcutSection"
          key={section}
          aria-label={section}
        >
          <h3 className="navSettingsLabel">{section}</h3>
          {keyboardShortcutActions
            .filter((action) => keyboardShortcutDefinitions[action].section === section)
            .map((action) => {
              const definition = keyboardShortcutDefinitions[action];
              const binding = keyboardShortcuts.bindings[action];
              return (
                <div className="navShortcutRow" key={action}>
                  <label className="navShortcutEnabled">
                    <input
                      type="checkbox"
                      aria-label={`Enable ${definition.label}`}
                      checked={binding.enabled}
                      onChange={(event) => {
                        const other = event.target.checked
                          ? conflict(action, binding.keys)
                          : undefined;
                        if (other) {
                          setError(
                            `Already used for ${keyboardShortcutDefinitions[other].label.toLowerCase()}.`,
                          );
                          return;
                        }
                        setError("");
                        setKeyboardShortcuts((current) => ({
                          ...current,
                          bindings: {
                            ...current.bindings,
                            [action]: {
                              ...current.bindings[action],
                              enabled: event.target.checked,
                            },
                          },
                        }));
                      }}
                    />
                    <span>{definition.label}</span>
                  </label>
                  <input
                    className="navShortcutBinding"
                    aria-label={`${definition.label} shortcut`}
                    readOnly
                    value={
                      recording === action
                        ? "Press keys…"
                        : binding.keys.map(formatKeyboardBinding).join(" / ")
                    }
                    onFocus={() => {
                      setRecording(action);
                      setError("");
                    }}
                    onBlur={() => setRecording(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Tab") return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.key === "Escape") {
                        event.currentTarget.blur();
                        return;
                      }
                      const key = keyboardBindingFromEvent(event.nativeEvent);
                      if (!key) return;
                      const other = binding.enabled ? conflict(action, [key]) : undefined;
                      if (other) {
                        setError(
                          `Already used for ${keyboardShortcutDefinitions[other].label.toLowerCase()}.`,
                        );
                        return;
                      }
                      setError("");
                      setKeyboardShortcuts((current) => ({
                        ...current,
                        bindings: {
                          ...current.bindings,
                          [action]: { ...current.bindings[action], keys: [key] },
                        },
                      }));
                      event.currentTarget.blur();
                    }}
                  />
                </div>
              );
            })}
        </section>
      ))}
      <div className="navSettingsSection">
        <button
          type="button"
          className="navSecondaryButton"
          onClick={() => {
            setKeyboardShortcuts(DEFAULT_KEYBOARD_SHORTCUTS);
            setRecording(null);
            setError("");
          }}
        >
          Reset shortcuts to defaults
        </button>
      </div>
    </div>
  );
};
