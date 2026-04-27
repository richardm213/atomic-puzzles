const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortValue(source[key]);
        return sorted;
      }, {});
  }
  return value;
};

const stableRequestKey = (parts: unknown): string => JSON.stringify(sortValue(parts));

export const cachedRequest = async <T>(
  cache: Map<string, Promise<T>>,
  keyParts: unknown,
  request: () => Promise<T>,
): Promise<T> => {
  const key = stableRequestKey(keyParts);
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const promise = request().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  return promise;
};
