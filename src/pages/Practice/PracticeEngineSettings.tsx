import { useEffect, useRef, useState } from "react";

import {
  normalizePracticeEngineSettings,
  PRACTICE_PRESETS,
  PRACTICE_SEARCH_LIMITS,
  type PracticeAdvanced,
  type PracticeEngineSettings as Settings,
  type PracticePreset,
  presetDefaults,
  strengthDefaults,
} from "../../lib/practice/engineSettings";

type Props = { value: Settings; onChange: (value: Settings) => void };
export const PracticeEngineSettings = ({ value, onChange }: Props) => {
  const [minGamesText, setMinGamesText] = useState(String(value.minGames));
  const draft = useRef(minGamesText);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    draft.current = String(value.minGames);
    setMinGamesText(draft.current);
  }, [value.minGames]);
  useEffect(
    () => () => {
      if (!draft.current.trim())
        latest.current.onChange(
          normalizePracticeEngineSettings({ ...latest.current.value, minGames: 1 }),
        );
    },
    [],
  );

  const update = (patch: Partial<Settings>) =>
    onChange(normalizePracticeEngineSettings({ ...value, ...patch }));
  const advanced = (key: keyof PracticeAdvanced, number: number) => {
    const next = { ...value.advanced, [key]: number };
    if (["inaccuracy", "mistake", "blunder"].includes(key)) {
      const others = next.inaccuracy + next.mistake + next.blunder - number;
      next[key] = Math.min(number, 100 - others);
    }
    update({ advanced: next });
  };
  const strengthCustom = Object.entries(strengthDefaults(value.strength)).some(
    ([key, v]) => value.advanced[key as keyof PracticeAdvanced] !== v,
  );
  const styleCustom = Object.entries(presetDefaults(value.preset)).some(
    ([key, v]) => value.advanced[key as keyof PracticeAdvanced] !== v,
  );
  return (
    <div className="practiceEngineSettings">
      <label>
        Strength{strengthCustom ? " (custom)" : ""}
        <input
          type="range"
          min="1"
          max="12"
          value={value.strength}
          onChange={(e) => {
            const strength = Number(e.target.value);
            update({ strength, advanced: { ...value.advanced, ...strengthDefaults(strength) } });
          }}
        />
        <span className="practiceEngineValue" aria-hidden="true">
          {value.strength} / 12
        </span>
      </label>
      <label>
        Preset{styleCustom ? " (custom)" : ""}
        <select
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value as PracticePreset;
            update({ preset, advanced: { ...value.advanced, ...presetDefaults(preset) } });
          }}
        >
          {Object.entries(PRACTICE_PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Move speed
        <input
          type="range"
          min="1"
          max={PRACTICE_SEARCH_LIMITS.length}
          value={value.speed}
          onChange={(e) => {
            const speed = Number(e.target.value);
            update({ speed, maxThinkTimeMs: PRACTICE_SEARCH_LIMITS[speed - 1]!.timeMs });
          }}
        />
        <span className="practiceEngineValue" aria-hidden="true">
          {value.speed} / {PRACTICE_SEARCH_LIMITS.length} · {value.maxThinkTimeMs / 1000}s max
        </span>
      </label>
      <label>
        Switch to engine below this many games
        <input
          type="number"
          min="1"
          max="10000"
          value={minGamesText}
          onChange={(event) => {
            draft.current = event.target.value;
            setMinGamesText(event.target.value);
            if (event.target.value.trim()) update({ minGames: Number(event.target.value) });
          }}
          onBlur={() => {
            if (!draft.current.trim()) {
              draft.current = "1";
              setMinGamesText("1");
              update({ minGames: 1 });
            }
          }}
        />
      </label>
      <details>
        <summary>Advanced engine settings</summary>
        {(
          [
            ["variety", "Move variety"],
            ["inaccuracy", "Inaccuracy frequency"],
            ["mistake", "Mistake frequency"],
            ["blunder", "Blunder frequency"],
            ["kingPressure", "King pressure"],
            ["material", "Material preference"],
            ["simplification", "Simplification"],
            ["counterplay", "Counterplay"],
          ] as const
        ).map(([key, label]) => {
          const frequency = ["inaccuracy", "mistake", "blunder"].includes(key);
          const scale = frequency ? 1 : 100;
          return (
            <label key={key}>
              {label}
              <input
                type="range"
                min={frequency ? 0 : key === "variety" ? 5 : -100}
                max="100"
                value={Math.round(value.advanced[key] * scale)}
                onChange={(e) => advanced(key, Number(e.target.value) / scale)}
              />
              <span className="practiceEngineValue" aria-hidden="true">
                {Math.round(value.advanced[key] * scale)}
                {frequency || key === "variety" ? "%" : ""}
              </span>
            </label>
          );
        })}
        <label>
          Maximum think time (seconds)
          <input
            type="number"
            min="0.05"
            max="12"
            step="0.05"
            value={value.maxThinkTimeMs / 1000}
            onChange={(e) => update({ maxThinkTimeMs: Number(e.target.value) * 1000 })}
          />
        </label>
      </details>
    </div>
  );
};
