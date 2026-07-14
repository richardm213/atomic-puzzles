import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-review";

const reviewerAccount = (username: string) =>
  new Response(JSON.stringify({ username }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("puzzle-review function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("only accepts POST requests", async () => {
    const response = await handler({ httpMethod: "GET" });
    expect(response.statusCode).toBe(405);
  });

  it("requires a Lichess access token", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "list" }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects invalid actions before contacting external services", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ action: "delete" }),
    });
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a valid Lichess account that is not the reviewer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("someone_else")),
    );
    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ action: "list" }),
    });
    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("validates edits before opening a database connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("seaside_tiramisu")),
    );
    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({
        action: "update",
        id: 4,
        fen: "bad fen",
        solution: "1. e4",
        explanation: "",
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("loads the queue only after verifying the reviewer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("Seaside_Tiramisu")),
    );
    const queueOrder = vi.fn(async () => ({ data: [{ id: 7 }], error: null }));
    const queueSelect = vi.fn(() => ({ order: queueOrder }));
    const latestLimit = vi.fn(async () => ({ data: [{ id: 1797 }], error: null }));
    const latestOrder = vi.fn(() => ({ limit: latestLimit }));
    const latestSelect = vi.fn(() => ({ order: latestOrder }));
    const from = vi.fn((table: string) =>
      table === "puzzles_queue" ? { select: queueSelect } : { select: latestSelect },
    );
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ action: "list" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ puzzles: [{ id: 7, next_puzzle_id: 1798 }] });
    expect(from).toHaveBeenCalledWith("puzzles_queue");
    expect(from).toHaveBeenCalledWith("puzzles");
    expect(queueOrder).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(latestOrder).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("does not query puzzle ids when the review queue is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("seaside_tiramisu")),
    );
    const order = vi.fn(async () => ({ data: [], error: null }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ action: "list" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ puzzles: [] });
    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("puzzles_queue");
  });

  it("validates and updates a pending puzzle through the service role", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("seaside_tiramisu")),
    );
    const saved = { id: 4, fen: "saved", solution: "1. e4", explanation: "idea" };
    const single = vi.fn(async () => ({ data: saved, error: null }));
    const select = vi.fn(() => ({ single }));
    const firstEq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq: firstEq }));
    const from = vi.fn(() => ({ update }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({
        action: "update",
        id: 4,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4",
        explanation: " idea ",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ puzzle: saved });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ solution: "1. e4", explanation: "idea" }),
    );
    expect(firstEq).toHaveBeenCalledWith("id", 4);
  });

  it("approves through the protected database function", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("seaside_tiramisu")),
    );
    const rpc = vi.fn(async () => ({ data: 42, error: null }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ action: "approve", id: 4 }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ puzzleId: 42 });
    expect(rpc).toHaveBeenCalledWith("approve_queued_puzzle", {
      p_queue_id: 4,
      p_reviewer: "seaside_tiramisu",
    });
  });

  it("returns a clear conflict when the reserved puzzle id already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("seaside_tiramisu")),
    );
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Puzzle ID 42 already exists" },
    }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ action: "approve", id: 4 }),
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ error: "Puzzle ID 42 already exists" });
  });

  it("explains when the approval database function has not been installed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("seaside_tiramisu")),
    );
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        message:
          "Could not find the function public.approve_queued_puzzle(p_queue_id, p_reviewer) in the schema cache",
      },
    }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ action: "approve", id: 4 }),
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "Puzzle approval is not configured yet. Run the latest puzzles_queue.sql in Supabase.",
    });
  });

  it("rejects by deleting the puzzle from the queue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reviewerAccount("seaside_tiramisu")),
    );
    const eq = vi.fn(async () => ({ error: null }));
    const deleteRow = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteRow }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ action: "reject", id: 4 }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ rejected: true });
    expect(from).toHaveBeenCalledWith("puzzles_queue");
    expect(deleteRow).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenCalledWith("id", 4);
  });
});
