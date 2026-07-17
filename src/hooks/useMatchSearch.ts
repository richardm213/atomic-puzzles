import { useCallback, useRef, useState } from "react";

export const useMatchSearch = () => {
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(
    async <T>(request: () => Promise<T>, onError?: (error: unknown) => void) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError("");
      try {
        const result = await request();
        if (requestId !== requestIdRef.current) return undefined;
        return result;
      } catch (requestError) {
        if (requestId !== requestIdRef.current) return undefined;
        onError?.(requestError);
        setError(String(requestError));
        return undefined;
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback((): void => {
    requestIdRef.current += 1;
    setLoading(false);
    setError("");
  }, []);

  return { error, loading, reset, run, setError };
};
