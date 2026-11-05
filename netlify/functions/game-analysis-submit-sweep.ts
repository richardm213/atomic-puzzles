import {
  hasPendingGameAnalyses,
  submitPendingGameAnalysisPositions,
} from "../features/gameAnalysis/service";

export default async (): Promise<void> => {
  if (!(await hasPendingGameAnalyses())) return;
  // Scheduled functions have 30 seconds. A 100-position slice fits that window even after
  // AtomicDB's first 50-request burst and its sustained five-request-per-second rate limit.
  await submitPendingGameAnalysisPositions(100);
};

export const config = { schedule: "* * * * *" } as const;
