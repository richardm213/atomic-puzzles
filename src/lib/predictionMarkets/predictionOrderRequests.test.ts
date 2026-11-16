import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../api/postApi", async (original) => ({
  ...(await original<typeof import("../api/postApi")>()),
  postApi: post,
}));
const order = {
  username: "trader",
  marketId: "strike",
  outcome: "yes",
  side: "buy",
  priceCents: 40,
  quantity: 10,
} as const;
const requestIds = () =>
  post.mock.calls.map((call) => (call[1] as { requestId: string }).requestId);

beforeEach(() => {
  vi.resetModules();
  post.mockReset();
  window.sessionStorage.clear();
});

describe("prediction order requests", () => {
  it("reuses an uncertain request across reloads, isolates accounts and permits a new identical order after success", async () => {
    const { placePredictionOrder } = await import("./predictionMarkets");
    const { ApiError } = await import("../api/postApi");
    post.mockRejectedValueOnce(new ApiError("Timed out", 0, "request_timeout", ""));
    await expect(placePredictionOrder(order)).rejects.toMatchObject({ code: "request_timeout" });
    const originalId = requestIds()[0];
    post.mockResolvedValue({ result: { orderId: 7, balance: 100 } });
    await placePredictionOrder({ ...order, username: "other" });
    expect(requestIds()[1]).not.toBe(originalId);
    vi.resetModules();
    const reloaded = await import("./predictionMarkets");
    await reloaded.placePredictionOrder(order);
    expect(requestIds()[2]).toBe(originalId);
    await reloaded.placePredictionOrder(order);
    expect(requestIds()[3]).not.toBe(originalId);
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("username");
  });

  it("retains the original ID through later rejection, server failure or invalid responses", async () => {
    const { placePredictionOrder } = await import("./predictionMarkets");
    const { ApiError } = await import("../api/postApi");
    for (const status of [409, 500, 200]) {
      const input = { ...order, quantity: status };
      post.mockRejectedValueOnce(
        new ApiError("Failed", status, status === 200 ? "invalid_response" : "request_failed", ""),
      );
      await expect(placePredictionOrder(input)).rejects.toBeInstanceOf(ApiError);
      const first = requestIds().at(-1);
      post.mockResolvedValueOnce({ result: { orderId: 7, balance: 100 } });
      await placePredictionOrder(input);
      expect(requestIds().at(-1)).toBe(first);
    }
  });
  it("keeps the original sportsbook quote after a timeout and reload", async () => {
    const { placePredictionOrder } = await import("./predictionMarkets");
    post.mockRejectedValueOnce(new Error("Connection lost"));
    await expect(placePredictionOrder({ ...order, budgetCoins: 4 })).rejects.toThrow();
    const original = post.mock.calls[0]?.[1];
    vi.resetModules();
    post.mockResolvedValueOnce({ result: { orderId: 7, balance: 100 } });
    const reloaded = await import("./predictionMarkets");
    await reloaded.placePredictionOrder({ ...order, budgetCoins: 4, priceCents: 50, quantity: 8 });
    expect(post.mock.calls[1]?.[1]).toEqual(original);
  });

  it("starts a fresh request after the database confirms rejection", async () => {
    const { placePredictionOrder } = await import("./predictionMarkets");
    const { ApiError } = await import("../api/postApi");
    post.mockRejectedValueOnce(new ApiError("Insufficient funds", 409, "order_rejected", ""));
    await expect(placePredictionOrder(order)).rejects.toMatchObject({ code: "order_rejected" });
    post.mockResolvedValueOnce({ result: { orderId: 7, balance: 100 } });
    await placePredictionOrder(order);
    expect(requestIds()[1]).not.toBe(requestIds()[0]);
  });

  it("coalesces concurrent submissions of the same intent", async () => {
    const { placePredictionOrder } = await import("./predictionMarkets");
    let complete!: (value: unknown) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const first = placePredictionOrder(order);
    const second = placePredictionOrder(order);
    expect(post).toHaveBeenCalledTimes(1);
    complete({ result: { orderId: 7, balance: 100 } });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { orderId: 7, balance: 100 },
      { orderId: 7, balance: 100 },
    ]);
  });
});
