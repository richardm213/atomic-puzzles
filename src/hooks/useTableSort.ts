import { useCallback, useState } from "react";

export type SortDirection = "asc" | "desc";

type UseTableSortOptions<Key extends string> = {
  getDefaultDirection?: (key: Key) => SortDirection;
  initialDirection?: SortDirection;
  initialKey: Key;
};

export const useTableSort = <Key extends string>({
  getDefaultDirection,
  initialDirection = "desc",
  initialKey,
}: UseTableSortOptions<Key>) => {
  const [sortKey, setSortKey] = useState<Key>(initialKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialDirection);

  const changeSort = useCallback(
    (nextKey: Key): void => {
      if (nextKey === sortKey) {
        setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }

      setSortKey(nextKey);
      setSortDirection(getDefaultDirection?.(nextKey) ?? initialDirection);
    },
    [getDefaultDirection, initialDirection, sortKey],
  );

  const toggleDirection = useCallback((): void => {
    setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  }, []);

  return { changeSort, sortDirection, sortKey, toggleDirection };
};
