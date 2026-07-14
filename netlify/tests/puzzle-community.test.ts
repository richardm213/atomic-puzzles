import { describe, expect, it } from "vitest";

import { handler } from "../functions/puzzle-community";

describe("puzzle-community function", () => {
  it("only accepts POST requests", async () => {
    const response = await handler({ httpMethod: "GET" });
    expect(response.statusCode).toBe(405);
  });

  it("rejects malformed requests", async () => {
    const response = await handler({ httpMethod: "POST", body: "{}" });
    expect(response.statusCode).toBe(400);
  });

  it("requires login for voting", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "vote", puzzleId: 1, vote: 1 }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("requires login for commenting", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "comment", puzzleId: 1, body: "Nice puzzle" }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("requires login for comment voting", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "commentVote", puzzleId: 1, commentId: 2, vote: 1 }),
    });
    expect(response.statusCode).toBe(401);
  });
});
