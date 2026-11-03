import { isValidAtomicDbFen, requestAtomicDbAnalysis } from "../lib/atomicDb";
import { requireSameOrigin } from "../platform/authentication";
import { defineFunction, type FunctionEvent } from "../platform/defineFunction";
import { jsonResponse } from "../platform/response";

const atomicDbRequestRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site AtomicDB requests are not allowed.");

  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return jsonResponse(400, { error: "A valid FEN is required.", code: "validation_failed" });
  }

  const fen = (body as { fen?: unknown } | null)?.fen;
  if (!isValidAtomicDbFen(fen)) {
    return jsonResponse(400, { error: "A valid FEN is required.", code: "validation_failed" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const result = await requestAtomicDbAnalysis(fen.trim(), controller.signal);
    return jsonResponse(200, {
      task: typeof result.task === "string" || typeof result.task === "number" ? result.task : null,
      taskState: typeof result.task_state === "string" ? result.task_state : "queued",
      budgetNodes: typeof result.budget_nodes === "number" ? result.budget_nodes : null,
      completedBudget:
        typeof result.completed_budget === "number" ? result.completed_budget : null,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const handler = defineFunction(atomicDbRequestRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to request AtomicDB analysis.",
  rateLimit: {
    buckets: [
      { capacity: 5, refillPerSecond: 0.2 },
      { capacity: 20, refillPerSecond: 0.05 },
    ],
    message: "Too many AtomicDB analysis requests. Please wait and try again.",
  },
});

export const config = { path: "/api/atomicdb-request" } as const;
