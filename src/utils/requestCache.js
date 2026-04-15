const sortValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortValue(value[key]);
        return sorted;
      }, {});
  }
  return value;
};

export const stableRequestKey = (parts) => JSON.stringify(sortValue(parts));

export const cachedRequest = async (cache, keyParts, request) => {
  const key = stableRequestKey(keyParts);
  if (cache.has(key)) {
    return cache.get(key);
  }

  const promise = request().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  return promise;
};
