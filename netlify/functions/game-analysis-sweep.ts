import { processPendingGameAnalyses } from "../features/gameAnalysis/service";

export default async (): Promise<void> => {
  await processPendingGameAnalyses();
};

export const config = { schedule: "*/2 * * * *" } as const;
