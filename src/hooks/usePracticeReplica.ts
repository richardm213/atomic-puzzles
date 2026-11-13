import { useEffect, useRef, useState } from "react";
import { z } from "zod";

const responseSchema = z.object({
  fen: z.string(),
  move: z
    .string()
    .regex(/^[a-h][1-8][a-h][1-8][nbrq]?$/)
    .nullable(),
});

type Props = {
  enabled: boolean;
  fen: string;
  rootFen: string;
  moves: string[];
  clockMs: number | null;
  timeControl: [number, number];
  exclude: string[];
  retry: number;
  onMove: (move: string) => void;
};

export const usePracticeReplica = (props: Props) => {
  const [error, setError] = useState("");
  const latest = useRef(props);
  latest.current = props;
  const { enabled, fen, rootFen, retry } = props;
  const moveKey = props.moves.join(" ");
  const controlKey = props.timeControl.join(" ");
  useEffect(() => {
    setError("");
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      setError("Rechesster took too long. Pause and resume to retry.");
      controller.abort();
    }, 30_000);
    const started = performance.now();
    const { moves, clockMs, timeControl, exclude } = latest.current;
    void fetch("/api/practice-replica", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, rootFen, moves, clockMs, timeControl, exclude }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            (payload as { error?: string }).error || "Could not load Rechesster's move",
          );
        const result = responseSchema.parse(payload);
        if (controller.signal.aborted || result.fen !== fen || !result.move) return;
        const move = result.move;
        timer = setTimeout(
          () => {
            if (
              !controller.signal.aborted &&
              latest.current.enabled &&
              latest.current.fen === fen &&
              latest.current.moves.join(" ") === moveKey &&
              latest.current.retry === retry
            )
              latest.current.onMove(move);
          },
          Math.max(0, 240 - (performance.now() - started)),
        );
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Could not load Rechesster's move");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
      clearTimeout(timer);
    };
  }, [enabled, fen, rootFen, moveKey, controlKey, retry]);
  return error;
};
