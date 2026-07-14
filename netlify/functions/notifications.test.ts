import { describe, expect, it } from "vitest";

import { handler } from "./notifications";

describe("notifications function", () => {
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
});
