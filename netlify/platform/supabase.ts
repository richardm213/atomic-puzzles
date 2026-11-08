type SupabaseError = { message: string } | null;

export const requireSupabaseRows = <Row>(
  result: { data: Row[] | null; error: SupabaseError },
  errorMessage: string,
): Row[] => {
  if (result.error) throw new Error(`${errorMessage}: ${result.error.message}`);
  return result.data ?? [];
};

export const requireSupabaseSuccess = (
  result: { error: SupabaseError },
  errorMessage: string,
): void => {
  if (result.error) throw new Error(`${errorMessage}: ${result.error.message}`);
};
