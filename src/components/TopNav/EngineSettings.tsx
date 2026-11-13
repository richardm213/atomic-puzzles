import { useEffect, useState } from "react";

import { useAppSettings } from "../../context/AppSettings";
import { PracticeEngineSettings } from "../../pages/Practice/PracticeEngineSettings";
import { usePracticeSettings } from "../../pages/Practice/usePracticeSettings";

export const EngineSettings = ({ practice }: { practice: boolean }) => {
  const { localAnalysisEngine, setLocalAnalysisEngine, showBestMoveArrow, setShowBestMoveArrow } =
    useAppSettings();
  const { settings, updateSettings } = usePracticeSettings();
  const [replicaAvailable, setReplicaAvailable] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !practice) return;
    const controller = new AbortController();
    void fetch("/api/practice-replica", { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { available?: boolean }) => {
        if (!controller.signal.aborted) setReplicaAvailable(data.available === true);
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
                  opponentModel: event.target.value === "rechesster" ? "rechesster" : "database",
                })
              }
            >
              <option value="database">Database / engine</option>
              {replicaAvailable ? <option value="rechesster">Rechesster</option> : null}
            </select>
          </div>
          {settings.opponentModel !== "rechesster" ? (
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
