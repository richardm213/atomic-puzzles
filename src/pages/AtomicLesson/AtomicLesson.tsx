import "./AtomicLesson.css";

import { Link } from "@tanstack/react-router";
import { parseSquare, roleToChar } from "chessops/util";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import {
  createPendingPromotion,
  getPromotionChoices,
  type PendingPromotion,
} from "../../components/Chessboard/promotionHelpers";
import { Seo } from "../../components/Seo/Seo";
import { usePersistedState } from "../../hooks/usePersistedState";
import { atomicLessons, type LessonDefinition, lessonGroups } from "./atomicLessons";
import { describePieces, LessonBoard } from "./LessonBoard";
import {
  type LessonFrame,
  lessonPosition,
  moveKey,
  playLessonMove,
  prepareLesson,
  readLessonMove,
} from "./lessonMoves";

const checkpointSchema = z.union([
  z.number().int().min(0),
  z.object({ step: z.number().int().min(0), finish: z.string() }),
]);
type Checkpoint = z.infer<typeof checkpointSchema>;

const progressSchema = z.object({
  active: z.string(),
  steps: z.record(z.string(), checkpointSchema),
  completed: z.array(z.string()),
});

type Feedback = {
  title: string;
  text: string;
  tone: "correct" | "retry";
  reply?: string | undefined;
};

type Scene = {
  step: number;
  frame: LessonFrame;
  phase: "ready" | "reply" | "retry" | "done";
  feedback?: Feedback | undefined;
  follow?: { frame: LessonFrame; text?: string | undefined; correct: boolean } | undefined;
};

const moveLabel = (color: "white" | "black") => (color === "white" ? "White" : "Black");

const initialScene = (
  lesson: LessonDefinition,
  prepared: ReturnType<typeof prepareLesson>,
  checkpoint: Checkpoint,
): Scene => {
  const step = Math.min(
    typeof checkpoint === "number" ? checkpoint : checkpoint.step,
    prepared.length,
  );
  const done = step === prepared.length;
  const previous = prepared.turns[step - 1];
  const alternate =
    done && typeof checkpoint !== "number"
      ? previous?.alternateFinishes.get(checkpoint.finish)
      : undefined;
  const correctOption = lesson.question?.options.find((option) => option.correct);
  return {
    step,
    phase: done ? "done" : "ready",
    frame: alternate?.frame ?? prepared.turns[step]?.before ?? prepared.final,
    feedback: previous
      ? {
          title: `${alternate?.frame.san ?? previous.answer.san} · Correct`,
          text: alternate?.note ?? previous.turn.note,
          tone: "correct",
          reply: previous.turn.reply
            ? `${previous.turn.reply.san}: ${previous.turn.reply.note}`
            : undefined,
        }
      : done && correctOption
        ? { title: "Correct", text: correctOption.note, tone: "correct" }
        : undefined,
  };
};

const LessonRunner = ({
  lesson,
  checkpoint,
  onCheckpoint,
  onNext,
  onSkip,
  nextLabel,
  allComplete,
}: {
  lesson: LessonDefinition;
  checkpoint: Checkpoint;
  onCheckpoint: (checkpoint: Checkpoint, complete: boolean) => void;
  onNext: (() => void) | undefined;
  onSkip: (() => void) | undefined;
  nextLabel: string;
  allComplete: boolean;
}) => {
  const prepared = useMemo(() => prepareLesson(lesson), [lesson]);
  const [scene, setScene] = useState(() => initialScene(lesson, prepared, checkpoint));
  const [hint, setHint] = useState(0);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);
  const entryRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const mobilePromptRef = useRef<HTMLParagraphElement>(null);
  const returnFocus = useRef(false);
  const position = useMemo(() => lessonPosition(scene.frame.fen), [scene.frame.fen]);
  const turn = prepared.turns[scene.step];
  const ready = scene.phase === "ready";
  const canMove = Boolean(ready && turn && !promotion);
  const done = scene.phase === "done";

  useEffect(() => {
    if ((scene.phase === "retry" || scene.phase === "done") && returnFocus.current) {
      actionRef.current?.focus();
      returnFocus.current = false;
    }
  }, [scene.phase]);

  useEffect(() => {
    const follow = scene.follow;
    if (scene.phase !== "reply" || !follow || !scene.feedback) return;
    const timer = window.setTimeout(() => {
      const step = scene.step + Number(follow.correct);
      const finished = follow.correct && step === prepared.length;
      setScene({
        step,
        frame: follow.frame,
        phase: follow.correct ? (finished ? "done" : "ready") : "retry",
        feedback: { ...scene.feedback!, reply: follow.text },
      });
      if (follow.correct) {
        onCheckpoint(step, finished);
        if (!finished && returnFocus.current) {
          returnFocus.current = false;
          window.requestAnimationFrame(() => entryRef.current?.focus());
        }
      }
    }, 580);
    return () => window.clearTimeout(timer);
  }, [onCheckpoint, prepared.length, scene]);

  const restart = () => {
    setScene(initialScene(lesson, prepared, 0));
    setHint(0);
    setEntry("");
    setError("");
    setPromotion(null);
    onCheckpoint(0, false);
    window.requestAnimationFrame(() => focusPrompt());
  };

  const focusPrompt = () => {
    if (lesson.question) document.getElementById("atomicLessonFirstChoice")?.focus();
    else if (entryRef.current?.closest("details")?.open) entryRef.current.focus();
    else if (mobilePromptRef.current?.getClientRects().length) mobilePromptRef.current.focus();
    else document.getElementById("atomicLessonPrompt")?.focus();
  };

  const retry = () => {
    const checkpointFrame = initialScene(lesson, prepared, scene.step);
    setScene(checkpointFrame);
    setError("");
    window.requestAnimationFrame(() => focusPrompt());
  };

  const play = (value: string, keyboard = false) => {
    if (!ready || !turn) return;
    const move = readLessonMove(position, value);
    if (!move) {
      setError("That move isn’t legal here. Try notation like Nf3 or coordinates like g1f3.");
      return;
    }
    returnFocus.current = keyboard;
    setEntry("");
    setError("");
    setPromotion(null);
    const key = moveKey(move);
    const alternateFinish = turn.alternateFinishes.get(key);
    if (key !== turn.key && !alternateFinish) {
      const alternative = turn.alternatives.get(key);
      const frame = playLessonMove(position.clone(), move);
      setScene({
        step: scene.step,
        frame,
        phase: alternative?.reply ? "reply" : "retry",
        feedback: {
          title: `${frame.san} · Try again`,
          text:
            alternative?.note ??
            "That move is legal, but it doesn’t meet this exercise’s goal. Try a different move or ask for a hint.",
          tone: "retry",
        },
        follow: alternative?.reply
          ? { frame: alternative.reply, text: `Reply: ${alternative.reply.san}`, correct: false }
          : undefined,
      });
      return;
    }

    const answer = alternateFinish?.frame ?? turn.answer;
    const feedback: Feedback = {
      title: `${answer.san} · Correct`,
      text: alternateFinish?.note ?? turn.turn.note,
      tone: "correct",
    };
    setHint(0);
    if (turn.reply && turn.turn.reply) {
      setScene({
        step: scene.step,
        frame: answer,
        phase: "reply",
        feedback,
        follow: {
          frame: turn.reply,
          text: `${turn.reply.san}: ${turn.turn.reply.note}`,
          correct: true,
        },
      });
    } else {
      const step = scene.step + 1;
      const finished = step === prepared.length;
      setScene({ step, frame: answer, phase: finished ? "done" : "ready", feedback });
      onCheckpoint(alternateFinish ? { step, finish: key } : step, finished);
    }
  };

  const playBoardMove = (origin: string, destination: string) => {
    if (!canMove) return;
    const from = parseSquare(origin);
    const to = parseSquare(destination);
    if (from === undefined || to === undefined) return;
    const choices = getPromotionChoices({ position, from, to, piece: position.board.get(from) });
    if (choices.length > 1) {
      setPromotion(
        createPendingPromotion({
          orig: origin,
          dest: destination,
          color: position.turn,
          orientation: prepared.color,
          choices,
        }),
      );
      return;
    }
    play(origin + destination + (choices[0] ? roleToChar(choices[0]) : ""));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    play(entry, true);
  };

  const prompt = lesson.question?.prompt ?? turn?.turn.prompt;
  const hintText = lesson.question?.hint ?? turn?.turn.hint;
  const reveal = lesson.question
    ? lesson.question.options.find((option) => option.correct)?.label
    : turn?.answer.san;

  return (
    <div className="atomicLessonWorkspace">
      {!lesson.question && (
        <p className="atomicLessonMobilePrompt" tabIndex={-1} ref={mobilePromptRef}>
          {canMove ? (
            <>
              <strong>{moveLabel(prepared.color)} to move. </strong>
              {prompt}
            </>
          ) : promotion ? (
            "Choose a promotion piece on the board."
          ) : (
            "See the move feedback below."
          )}
        </p>
      )}
      <div className="atomicLessonBoard">
        <LessonBoard
          frame={scene.frame}
          position={position}
          orientation={prepared.color}
          enabled={canMove}
          onMove={playBoardMove}
          promotion={promotion}
          onPromote={(role) => {
            if (promotion) play(promotion.orig + promotion.dest + roleToChar(role), true);
          }}
          onCancelPromotion={() => {
            setPromotion(null);
            window.requestAnimationFrame(() => focusPrompt());
          }}
        />
        <details className="atomicLessonMoveEntry">
          <summary>Board position and move entry</summary>
          <p>
            <strong>White:</strong> {describePieces(position, "white")}.
          </p>
          <p>
            <strong>Black:</strong> {describePieces(position, "black")}.
          </p>
          {!lesson.question && (
            <form onSubmit={submit} className="atomicLessonEntryForm">
              <label htmlFor="atomicLessonMove">Enter a move</label>
              <div>
                <input
                  id="atomicLessonMove"
                  ref={entryRef}
                  value={entry}
                  onChange={(event) => {
                    setEntry(event.target.value);
                    setError("");
                  }}
                  placeholder="e.g. Nf3 or g1f3"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={!canMove}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "atomicLessonEntryError" : undefined}
                />
                <button
                  className="atomicLessonButton"
                  disabled={!canMove || !entry.trim()}
                  type="submit"
                >
                  Play
                </button>
              </div>
              {error && (
                <p id="atomicLessonEntryError" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
        </details>
      </div>

      <section className="atomicLessonCoach" aria-labelledby="atomicLessonTitle">
        <h2 id="atomicLessonTitle">{lesson.title}</h2>

        <div className="atomicLessonFeedback" role="status" aria-atomic="true">
          {scene.feedback && (
            <div className="atomicLessonNote" data-tone={scene.feedback.tone}>
              <strong>{scene.feedback.title}</strong>
              <p>{scene.feedback.text}</p>
              {scene.feedback.reply && <p className="atomicLessonReply">{scene.feedback.reply}</p>}
            </div>
          )}
          {scene.phase === "reply" && <p className="atomicLessonWaiting">Playing the reply…</p>}
        </div>

        {ready && (
          <div className="atomicLessonTask">
            <p
              id="atomicLessonPrompt"
              tabIndex={-1}
              className={lesson.question ? undefined : "atomicLessonDesktopPrompt"}
            >
              {!lesson.question && <strong>{moveLabel(prepared.color)} to move. </strong>}
              {prompt}
            </p>
            {lesson.question && (
              <div className="atomicLessonChoices">
                {lesson.question.options.map((option, index) => (
                  <button
                    className="atomicLessonButton"
                    id={index === 0 ? "atomicLessonFirstChoice" : undefined}
                    key={option.label}
                    type="button"
                    onClick={() => {
                      returnFocus.current = true;
                      const correct = Boolean(option.correct);
                      setScene({
                        step: Number(correct),
                        frame: prepared.start,
                        phase: correct ? "done" : "retry",
                        feedback: {
                          title: correct ? "Correct" : "Try again",
                          text: option.note,
                          tone: correct ? "correct" : "retry",
                        },
                      });
                      if (correct) onCheckpoint(1, true);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            {hint > 0 && (
              <p className="atomicLessonHint" role="status">
                {hint === 1 ? hintText : `Try ${reveal}.`}
              </p>
            )}
          </div>
        )}

        <div className="atomicLessonActions">
          {scene.phase === "retry" && (
            <button
              ref={(element) => {
                actionRef.current = element;
              }}
              className="atomicLessonButton atomicLessonPrimary"
              type="button"
              onClick={retry}
            >
              Try again
            </button>
          )}
          {done &&
            (onNext ? (
              <button
                ref={(element) => {
                  actionRef.current = element;
                }}
                className="atomicLessonButton atomicLessonPrimary"
                type="button"
                onClick={onNext}
              >
                {nextLabel}
              </button>
            ) : (
              <Link
                className="atomicLessonButton atomicLessonPrimary"
                to="/atomic-chess"
                ref={(element) => {
                  actionRef.current = element;
                }}
              >
                {allComplete ? "Back to the guide" : "Read the guide"}
              </Link>
            ))}
          {ready && !promotion && (
            <button
              className="atomicLessonButton"
              type="button"
              onClick={() => setHint(hint === 2 ? 1 : hint + 1)}
            >
              {hint === 0
                ? "Get a hint"
                : `${hint === 1 ? "Show" : "Hide"} ${lesson.question ? "answer" : "move"}`}
            </button>
          )}
          {!done && onSkip && scene.phase !== "reply" && (
            <button className="atomicLessonTextButton" type="button" onClick={onSkip}>
              Skip chapter
            </button>
          )}
          {(done || scene.step > 0) && scene.phase !== "reply" && (
            <button className="atomicLessonTextButton" type="button" onClick={restart}>
              Restart chapter
            </button>
          )}
        </div>
        {done && allComplete && (
          <p className="atomicLessonFinished">
            All chapters complete. You can revisit any chapter above.
          </p>
        )}
      </section>
    </div>
  );
};

export const AtomicLessonPage = () => {
  const [progress, setProgress] = usePersistedState(
    "atomic-puzzles.lesson.progress.v1",
    progressSchema,
    { active: atomicLessons[0]!.id, steps: {}, completed: [] },
  );
  const index = Math.max(
    0,
    atomicLessons.findIndex((entry) => entry.id === progress.active),
  );
  const lesson = atomicLessons[index]!;
  const completed = new Set(progress.completed);
  const count = atomicLessons.filter((entry) => completed.has(entry.id)).length;
  const title = useRef<HTMLHeadingElement>(null);

  const selectChapter = (id: string) => {
    setProgress((previous) => ({ ...previous, active: id }));
    title.current?.focus();
    title.current?.scrollIntoView({ block: "start" });
  };

  const onCheckpoint = useCallback(
    (checkpoint: Checkpoint, complete: boolean) => {
      setProgress((previous) => ({
        ...previous,
        steps: { ...previous.steps, [lesson.id]: checkpoint },
        completed:
          complete && !previous.completed.includes(lesson.id)
            ? [...previous.completed, lesson.id]
            : previous.completed,
      }));
    },
    [lesson.id, setProgress],
  );

  const next = atomicLessons[index + 1];
  const firstIncomplete = atomicLessons.find(
    (entry) => entry.id !== lesson.id && !completed.has(entry.id),
  );

  return (
    <div className="page atomicLessonPage">
      <Seo
        title="Learn Atomic Chess: Interactive Lessons | Atomic Puzzles"
        description="Play through atomic chess rules, tactics, endgames, and three starter openings. Get a coaching note after each move."
        path="/atomic-chess/lesson"
      />
      <header>
        <Link className="atomicLessonBack" to="/atomic-chess">
          ← Atomic chess guide
        </Link>
        <h1 ref={title} tabIndex={-1}>
          Learn atomic chess
        </h1>
      </header>
      <div className="atomicLessonToolbar">
        <div className="atomicLessonChapter">
          <label htmlFor="atomicLessonChapter">Chapter</label>
          <select
            id="atomicLessonChapter"
            value={lesson.id}
            onChange={(event) =>
              setProgress((previous) => ({ ...previous, active: event.target.value }))
            }
          >
            {lessonGroups.map((group) => (
              <optgroup key={group} label={group}>
                {atomicLessons.map(
                  (entry, i) =>
                    entry.group === group && (
                      <option key={entry.id} value={entry.id}>
                        {i + 1}. {entry.title}
                        {completed.has(entry.id) ? " (complete)" : ""}
                      </option>
                    ),
                )}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="atomicLessonProgress">
          <label htmlFor="atomicLessonProgress">
            {count} of {atomicLessons.length} chapters complete
          </label>
          <progress id="atomicLessonProgress" max={atomicLessons.length} value={count}></progress>
        </div>
      </div>
      <LessonRunner
        key={lesson.id}
        lesson={lesson}
        checkpoint={progress.steps[lesson.id] ?? 0}
        onCheckpoint={onCheckpoint}
        onNext={
          next
            ? () => selectChapter(next.id)
            : firstIncomplete
              ? () => selectChapter(firstIncomplete.id)
              : undefined
        }
        onSkip={next ? () => selectChapter(next.id) : undefined}
        nextLabel={next ? "Next chapter" : "Go to unfinished chapter"}
        allComplete={count === atomicLessons.length}
      />
    </div>
  );
};
