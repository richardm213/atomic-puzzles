import { INITIAL_FEN } from "chessops/fen";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
import { openingCards, validateOpeningDocument } from "../../shared/domain/openings/repertoire";
import { handler } from "../functions/openings";
import { createSiteSessionCookie } from "../lib/siteSession";

const id = "4b648b2a-e2bf-49dc-aaed-235c05615d1b";
const document = validateOpeningDocument({
  startFen: INITIAL_FEN,
  side: "white",
  lines: [
    { id: "main", kind: "essential", moves: ["e2e4"] },
    { id: "quiz", kind: "tertiary", moves: ["d2d4"] },
  ],
});
const request = (body: object, signedIn = true, origin?: string) =>
  handler({
    httpMethod: "POST",
    headers: {
      ...(signedIn ? { cookie: createSiteSessionCookie("Solver", {}).split(";")[0] } : {}),
      ...(origin ? { origin, host: "localhost:5173" } : {}),
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.stubEnv(
    "SITE_SESSION_SECRET",
    "test-session-secret-that-is-longer-than-thirty-two-characters",
  );
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: { document, progress: {}, revision: 1 }, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("protects private openings and cross-site writes while allowing public catalog", async () => {
  expect((await request({ action: "get", id }, false)).statusCode).toBe(401);
  expect(
    (await request({ action: "publish", id, revision: 1, price: 5 }, true, "https://other.example"))
      .statusCode,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect((await request({ action: "catalog" }, false)).statusCode).toBe(200);
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "Opening not found or not owned" } });
  expect((await request({ action: "get", id })).statusCode).toBe(404);
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    "opening_command",
    expect.objectContaining({ p_username: "solver", p_action: "get" }),
  );
});

it("rejects illegal repertoire moves and client-supplied review state", async () => {
  expect(
    (
      await request({
        action: "create",
        id,
        title: "Test",
        description: "",
        document: { ...document, lines: [{ id: "bad", kind: "essential", moves: ["e2e5"] }] },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await request({
        action: "review",
        id,
        revision: 1,
        card: "forged",
        move: "e2e4",
        state: { correct: 100 },
      })
    ).statusCode,
  ).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("computes reviews from the owned server document and refuses quiz scheduling", async () => {
  const card = openingCards(document, "essential")[0]!;
  expect(
    (await request({ action: "review", id, revision: 1, card: card.key, move: "e2e4" })).statusCode,
  ).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith(
    "opening_command",
    expect.objectContaining({
      p_username: "solver",
      p_action: "review",
      p_input: expect.objectContaining({
        previous: null,
        state: expect.objectContaining({ correct: 1, intervalDays: 1 }),
      }),
    }),
  );
  const quiz = openingCards(document, "tertiary")[0]!;
  expect(
    (await request({ action: "review", id, revision: 1, card: quiz.key, move: "d2d4" })).statusCode,
  ).toBe(400);
  expect(
    (await request({ action: "review", id, revision: 2, card: card.key, move: "e2e4" })).statusCode,
  ).toBe(409);
});
