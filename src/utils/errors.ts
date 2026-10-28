export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message;
  return typeof error === "string" && error.trim() ? error : fallback;
};
