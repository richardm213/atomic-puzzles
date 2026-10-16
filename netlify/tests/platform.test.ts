import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineFunction } from "../platform/defineFunction";
import { readServerEnvironment } from "../platform/environment";
import { HttpError } from "../platform/errors";
import { jsonResponse } from "../platform/response";
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("function platform", () => {
  it("enforces configured methods and standard response headers", async () => {
    const response = await functionUnderTest({
      httpMethod: "GET",
      headers: { "x-nf-request-id": "request-123" },
    });
    expect(response.statusCode).toBe(405);
    expect(response.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": "request-123",
      "X-API-Version": "1",
      Link: expect.stringContaining("/api/openapi.json"),
      Allow: "POST, OPTIONS",
    });
    expect(JSON.parse(response.body)).toEqual({
      error: "Method not allowed.",
      code: "method_not_allowed",
    });
  });

  it("maps validation and explicit HTTP errors consistently", async () => {
    const invalid = await functionUnderTest({ httpMethod: "POST", body: "not-json" });
    const forbidden = await functionUnderTest({
      httpMethod: "POST",
      body: JSON.stringify({ value: "forbidden" }),
    });
    expect([invalid.statusCode, forbidden.statusCode]).toEqual([400, 403]);
    expect(JSON.parse(invalid.body)).toEqual({
      error: "Invalid request.",
      code: "invalid_json",
    });
    expect(JSON.parse(forbidden.body)).toEqual({
      error: "Forbidden.",
      code: "forbidden",
    });
  });

  it("returns actionable validation details without exposing submitted values", async () => {
    const response = await functionUnderTest({
      httpMethod: "POST",
      body: JSON.stringify({ value: 42, privateValue: "do-not-return" }),
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "Invalid request.",
      code: "validation_failed",
      details: {
        issues: [{ path: "value", message: "Invalid input: expected string, received number" }],
      },
    });
    expect(response.body).not.toContain("do-not-return");
  });

  it("answers preflight discovery without invoking the route", async () => {
    const response = await functionUnderTest({ httpMethod: "OPTIONS" });
    expect(response).toMatchObject({
      statusCode: 204,
      headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" },
      body: "",
    });
  });

  it("does not expose unexpected backend error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await functionUnderTest({
      httpMethod: "POST",
      body: JSON.stringify({ value: "broken" }),
    });
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      error: "Request failed.",
      code: "internal_error",
    });
    expect(response.body).not.toContain("database");
  });
});

describe("server environment", () => {
  it("uses the canonical shared Supabase project instead of a stale server fallback", () => {
    vi.stubEnv("SUPABASE_URL", "https://legacy.supabase.co");
    vi.stubEnv("VITE_SUPABASE_URL", "https://current.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    expect(readServerEnvironment("Puzzle submission service").supabaseUrl).toBe(
      "https://current.supabase.co",
    );
  });
});
