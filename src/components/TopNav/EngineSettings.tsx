import { useEffect, useState } from "react";

import { useAppSettings } from "../../context/AppSettings";
import { PracticeEngineSettings } from "../../pages/Practice/PracticeEngineSettings";
import { usePracticeSettings } from "../../pages/Practice/usePracticeSettings";

const RatingInput = ({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className="navSettingsField">
      <label className="navSettingsLabel" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="navRatingInput"
        type="number"
        min="500"
        max="3000"
        step="50"
        value={draft}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const number = Number(text);
          if (text && Number.isFinite(number) && number >= 500 && number <= 3000) onChange(number);
        }}
        onBlur={() => {
          const number = draft.trim() ? Number(draft) : value;
          const normalized = Number.isFinite(number)
            ? Math.min(3000, Math.max(500, Math.round(number)))
            : value;
          setDraft(String(normalized));
          onChange(normalized);
        }}
      />
    </div>
  );
};

export const EngineSettings = ({ practice }: { practice: boolean }) => {
  const { localAnalysisEngine, setLocalAnalysisEngine, showBestMoveArrow, setShowBestMoveArrow } =
    useAppSettings();
  const { settings, updateSettings } = usePracticeSettings();
  const [localModels, setLocalModels] = useState({ rechesster: false, human: false });
  useEffect(() => {
    if (!import.meta.env.DEV || !practice) return;
    const controller = new AbortController();
    void fetch("/api/practice-replica", { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { models?: { rechesster: boolean; human: boolean } }) => {
        if (!controller.signal.aborted && data.models) setLocalModels(data.models);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [practice]);
  return (
    <>
      <div className="navSettingsField">
        <label className="navSettingsLabel" htmlFor="local-analysis-engine-select">
          Analysis engine
        </label>
        <select
          id="local-analysis-engine-select"
          value={localAnalysisEngine}
          onChange={(event) =>
            setLocalAnalysisEngine(
              event.target.value === "fairy-stockfish-14"
                ? "fairy-stockfish-14"
                : "atomic-stockfish",
            )
          }
        >
          <option value="atomic-stockfish">Atomic-Stockfish</option>
          <option value="fairy-stockfish-14">Fairy-Stockfish 14</option>
        </select>
      </div>
      <label className="navSettingsCheckbox">
        <span>Best move arrow</span>
        <input
          type="checkbox"
          checked={showBestMoveArrow}
          onChange={(event) => setShowBestMoveArrow(event.target.checked)}
        />
      </label>
      {practice ? (
        <>
          <div className="navSettingsField">
            <label className="navSettingsLabel" htmlFor="practice-opponent-model">
              Opponent
            </label>
            <select
              id="practice-opponent-model"
              value={settings.opponentModel}
              onChange={(event) =>
                updateSettings({
                  opponentModel:
                    event.target.value === "rechesster" || event.target.value === "human"
                      ? event.target.value
                      : "database",
                })
              }
            >
              <option value="database">Database / engine</option>
              {localModels.rechesster ? <option value="rechesster">Rechesster</option> : null}
              {localModels.human ? <option value="human">Human model (local)</option> : null}
            </select>
          </div>
          {settings.opponentModel === "human" ? (
            <>
              <RatingInput
                id="practice-humanRating"
                label="Engine target rating"
                value={settings.humanRating}
                onChange={(humanRating) => updateSettings({ humanRating })}
              />
              <details className="navSettingsAdvanced">
                <summary>Advanced</summary>
                <RatingInput
                  id="practice-humanOpponentRating"
                  label="Assumed opponent rating"
                  value={settings.humanOpponentRating}
                  onChange={(humanOpponentRating) => updateSettings({ humanOpponentRating })}
                />
              </details>
              <p className="navSettingsHint">
                Experimental rating inputs; playing strength is not calibrated yet.
              </p>
            </>
          ) : null}
          {settings.opponentModel === "database" ? (
            <PracticeEngineSettings
              value={settings.engine}
              onChange={(engine) => updateSettings({ engine })}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
};
