export type PaginationOptions = {
  page?: number;
  pageSize?: number;
  includeTotal?: boolean;
};

export type PaginationMetadata = {
  total: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export type PaginatedCollection<Key extends string, Item> = PaginationMetadata &
  Record<Key, Item[]>;
