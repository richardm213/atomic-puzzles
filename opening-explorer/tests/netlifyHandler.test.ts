import { describe, expect, it, vi } from "vitest";

import { createNetlifyOpeningExplorerHandler } from "../adapters/netlifyHandler.js";

const success = {
  statusCode: 200,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: "{}",
};

describe("Netlify Opening Explorer boundary", () => {
  it("answers preflight without invoking the explorer service", async () => {
    const handle = vi.fn();
    const response = await createNetlifyOpeningExplorerHandler({ handle })({
      httpMethod: "OPTIONS",
    });

    expect(response).toEqual({
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
      },
      body: "",
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests before invoking the explorer service", async () => {
    const handle = vi.fn();
    const response = await createNetlifyOpeningExplorerHandler({ handle })({
      httpMethod: "GET",
      headers: {
        host: "atomic.example",
        origin: "https://attacker.example",
        "x-nf-client-connection-ip": "198.51.100.10",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      error: "Opening explorer requests must come from this site",
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("forwards normalized query parameters and visible-work intent", async () => {
    const handle = vi.fn().mockResolvedValue(success);
    await createNetlifyOpeningExplorerHandler({ handle })({
      httpMethod: "GET",
      path: "/api/opening-explorer",
      headers: {
        Host: "atomic.example",
        Origin: "https://atomic.example",
        "X-Explorer-Intent": "visible",
        "X-NF-Client-Connection-IP": "198.51.100.11",
      },
      queryStringParameters: { fen: "fixture", speeds: "0,1", ignored: undefined },
    });

    expect(handle).toHaveBeenCalledOnce();
    const request = handle.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      method: "GET",
      path: "/api/opening-explorer",
      intent: "visible",
    });
    expect(Object.fromEntries(request.params)).toEqual({ fen: "fixture", speeds: "0,1" });
  });

  it("rate-limits one forwarded client without sending excess work downstream", async () => {
    const handle = vi.fn().mockResolvedValue(success);
    const handler = createNetlifyOpeningExplorerHandler({ handle });
    const event = {
      httpMethod: "GET",
      headers: { "x-forwarded-for": "198.51.100.12, 10.0.0.1" },
    };

    for (let request = 0; request < 90; request += 1) {
      expect((await handler(event)).statusCode).toBe(200);
    }
    const limited = await handler(event);

    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["Retry-After"])).toBeGreaterThan(0);
    expect(handle).toHaveBeenCalledTimes(90);
  });
  it("forwards per-tab ordering scoped to the requesting client", async () => {
    const handle = vi.fn().mockResolvedValue(success);
    const handler = createNetlifyOpeningExplorerHandler({ handle });
    const session = "7df5aa4d-e7c6-4caf-b1fc-5b1474e9891a";
    for (const ip of ["198.51.100.20", "198.51.100.21"]) {
      await handler({
        headers: {
          "X-Explorer-Session": session,
          "X-Explorer-Sequence": "7",
          "X-NF-Client-Connection-IP": ip,
        },
      });
    }
    expect(handle.mock.calls[0]![0].navigation).toEqual({
      session: `198.51.100.20:${session}`,
      sequence: 7,
    });
    expect(handle.mock.calls[1]![0].navigation).toEqual({
      session: `198.51.100.21:${session}`,
      sequence: 7,
    });
    await handler({ headers: { "X-Explorer-Session": session, "X-Explorer-Sequence": "bad" } });
    expect(handle.mock.calls[2]![0].navigation).toBeUndefined();
  });
});
