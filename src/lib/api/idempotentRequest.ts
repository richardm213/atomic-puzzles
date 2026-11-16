import {
  getBrowserStorageItem,
  removeBrowserStorageItem,
  setBrowserStorageItem,
} from "../../utils/browserStorage";
import { ApiError } from "./postApi";

type PendingRequest<T> = { requestId: string; payload: T };
const pending = new Map<string, PendingRequest<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
export const idempotentRequest = <P, T>(
  key: string,
  payload: P,
  submit: (requestId: string, originalPayload: P) => Promise<T>,
): Promise<T> => {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const storageKey = `pending-request:${key}`;
  let intent = pending.get(key) as PendingRequest<P> | undefined;
  const stored = getBrowserStorageItem("session", storageKey);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as PendingRequest<P>;
      if (typeof parsed.requestId === "string" && parsed.payload) intent = parsed;
    } catch {
      /* Ignore invalid browser state. */
    }
  }
  intent ??= { requestId: crypto.randomUUID(), payload };
  const original = intent;
  const serialized = JSON.stringify(original);
  pending.set(key, original);
  setBrowserStorageItem("session", storageKey, serialized);
  const clear = () => {
    if (pending.get(key) === original) pending.delete(key);
    if (getBrowserStorageItem("session", storageKey) === serialized)
      removeBrowserStorageItem("session", storageKey);
  };
  const request = (async () => {
    try {
      const result = await submit(original.requestId, original.payload);
      clear();
      return result;
    } catch (error) {
      // Only the receipt-first database function can prove non-execution.
      // Transport, authentication and rate-limit errors retain the original intent.
      if (error instanceof ApiError && error.code === "order_rejected") clear();
      throw error;
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};
