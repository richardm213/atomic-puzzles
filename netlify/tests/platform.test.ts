import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineFunction, jsonResponse } from "../platform/defineFunction";
import { HttpError } from "../platform/errors";
import { parseJsonBody } from "../platform/validation";

const functionUnderTest = defineFunction(
  async (event) => {
    const input = parseJsonBody(event, z.object({ value: z.string() }), "Invalid request.");
    if (input.value === "forbidden") throw new HttpError(403, "Forbidden.");
    if (input.value === "broken") throw new Error("private database detail");
    return jsonResponse(200, { value: input.value });
  },
  { methods: ["POST"], fallbackMessage: "Request failed." },
);

afterEach(() => vi.restoreAllMocks());

describe("function platform", () => {
  it("enforces configured methods and standard response headers", async () => {
    const response = await functionUnderTest({ httpMethod: "GET" });
    expect(response.statusCode).toBe(405);
    expect(response.headers).toMatchObject({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
  });

  it("maps validation and explicit HTTP errors consistently", async () => {
    const invalid = await functionUnderTest({ httpMethod: "POST", body: "not-json" });
    const forbidden = await functionUnderTest({
      httpMethod: "POST",
      body: JSON.stringify({ value: "forbidden" }),
    });
    expect([invalid.statusCode, forbidden.statusCode]).toEqual([400, 403]);
    expect(JSON.parse(invalid.body)).toEqual({ error: "Invalid request." });
    expect(JSON.parse(forbidden.body)).toEqual({ error: "Forbidden." });
  });

  it("does not expose unexpected backend error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await functionUnderTest({
      httpMethod: "POST",
      body: JSON.stringify({ value: "broken" }),
    });
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: "Request failed." });
    expect(response.body).not.toContain("database");
  });
});
