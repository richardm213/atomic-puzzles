import { appAssetPath } from "../../utils/appAssetPath";

export const BOARD_SOUND_SETS = [
  { value: "standard", label: "Standard" },
  { value: "piano", label: "Piano" },
  { value: "nes", label: "NES" },
  { value: "sfx", label: "SFX" },
  { value: "futuristic", label: "Futuristic" },
  { value: "lisp", label: "Lisp" },
  { value: "woodland", label: "Woodland" },
  { value: "robot", label: "Robot" },
  { value: "music", label: "Pentatonic" },
] as const;

export type BoardSoundSet = (typeof BOARD_SOUND_SETS)[number]["value"];
export type BoardSoundEvent = "move" | "capture" | "check" | "explosion";

const audioNames: Record<BoardSoundEvent, string> = {
  move: "Move",
  capture: "Capture",
  check: "Check",
  explosion: "Explosion",
};

const audioCache = new Map<string, HTMLAudioElement>();

const playAudioSource = (source: string, volume = 1): void => {
  if (typeof Audio === "undefined") return;

  const audio = audioCache.get(source) ?? new Audio(source);
  audioCache.set(source, audio);
  audio.volume = volume;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Audio can be blocked until the browser receives a user gesture.
  });
};

export const isBoardSoundSet = (value: unknown): value is BoardSoundSet =>
  typeof value === "string" && BOARD_SOUND_SETS.some((option) => option.value === value);

export const boardSoundEventForMove = ({
  san,
  isCheck,
  isAtomic = true,
}: {
  san: string;
  isCheck: boolean;
  isAtomic?: boolean;
}): BoardSoundEvent => {
  if (san.includes("x")) return isAtomic ? "explosion" : "capture";
  if (isCheck) return "check";
  return "move";
};

export const playBoardSound = (soundSet: BoardSoundSet, event: BoardSoundEvent): void => {
  if (soundSet === "music") {
    const swell = Math.floor(Math.random() * 3) + 1;
    playAudioSource(appAssetPath(`/sounds/board/music/swells/swell${swell}.mp3`), 0.8);
    return;
  }

  // Lichess's Standard set intentionally has no distinct check cue.
  const resolvedEvent = soundSet === "standard" && event === "check" ? "move" : event;
  const source = appAssetPath(`/sounds/board/${soundSet}/${audioNames[resolvedEvent]}.mp3`);
  playAudioSource(source);
};

export const playBoardMoveSound = (
  soundSet: BoardSoundSet,
  { san, uci, isCheck }: { san: string; uci: string; isCheck: boolean },
): void => {
  if (soundSet !== "music") {
    playBoardSound(soundSet, boardSoundEventForMove({ san, isCheck }));
    return;
  }

  const destination = uci.slice(2, 4).toLowerCase();
  const file = "abcdefgh".indexOf(destination[0] ?? "");
  const rank = Number(destination[1]) - 1;
  if (file < 0 || rank < 0 || rank > 7) return;

  const pitch = Math.round(Math.max(0, Math.min(23, (file * 8 + rank) / (64 / 23))));
  const instrument = /^[a-z]/.test(san) || san.startsWith("K") ? "clav" : "celesta";
  const sample = String(pitch + 1).padStart(3, "0");
  playAudioSource(
    appAssetPath(`/sounds/board/music/${instrument}/c${sample}.mp3`),
    instrument === "clav" ? 0.2 : 0.3,
  );

  if (san.includes("x") || isCheck || san.startsWith("O-O") || san.includes("#")) {
    const swell = Math.floor(pitch / 8) + 1;
    playAudioSource(appAssetPath(`/sounds/board/music/swells/swell${swell}.mp3`), 0.8);
  }
};
