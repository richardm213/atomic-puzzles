import { createHash } from "node:crypto";

import {
  type CatalogRow,
  knockoutAwards,
  type PointAward,
} from "../../../shared/domain/atomicTourAwards";
import {
  type AdminMarket,
  type Fixture,
  fixtureWinner,
  type MarketResolutionInput,
  type ResolutionPreview,
  type ResolutionSummary,
  tournamentResultChanges,
} from "../../../shared/domain/marketAdmin";
import {
  type PredictionPositionCredit,
  type PredictionPositionFill,
  replayPredictionPosition,
} from "../../../shared/domain/predictionAccounting";
import { HttpError } from "../../platform/errors";
import { archiveDate, findArchivedMatches } from "./archive";
import type { MarketAdminRepository } from "./repository";
import type {
  Credit,
  Fill,
  Ledger,
  Market,
  Position,
  PreparedResolution,
  Settlement,
} from "./types";

const lower = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const money = (value: number) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exclusiveGroup = (id: string | null) =>
  id?.endsWith("-champion") || id === "november-atomic-shield-2026";
const title = (market: Market) => market.display_name || market.question;
const label = (market: Market, outcome: "yes" | "no") =>
  outcome === "yes" ? market.outcome_yes_label || "Yes" : market.outcome_no_label || "No";
const fixtureFor = (market: Market, fixtures: Fixture[]) =>
  fixtures.find((f) => market.id === `${f.tournament}-${f.id}`);

export class MarketAdminService {
  constructor(
    private readonly repository: MarketAdminRepository,
    private readonly actor: string,
  ) {}

  operationKey(input: MarketResolutionInput) {
    return `market-admin:${digest({ actor: this.actor, input })}`;
  }

  async context() {
    const markets = await this.repository.rows<Market>("prediction_markets");
    const eventIds = [
      ...new Set(
        markets.flatMap((m) => {
          const id = /^([a-z][a-z0-9]*\d{4})-/.exec(m.id)?.[1];
          return id ? [id] : [];
        }),
      ),
    ];
    const fixtures = eventIds.length
      ? await this.repository.rows<Fixture>("tournament_matches", "*", { tournament: eventIds })
      : [];
    return { markets, fixtures };
  }

  async list(): Promise<{ markets: AdminMarket[] }> {
    const context = await this.context();
    return {
      markets: context.markets
        .sort(
          (a, b) =>
            (a.group_order ?? 0) - (b.group_order ?? 0) ||
            (a.display_order ?? 0) - (b.display_order ?? 0),
        )
        .map((m) => ({
          id: m.id,
          title: title(m),
          group: m.group_title || "Other markets",
          status: m.status,
          choices: { yes: label(m, "yes"), no: label(m, "no") },
          fixture: fixtureFor(m, context.fixtures) ?? null,
        })),
    };
  }

  async preview(input: MarketResolutionInput): Promise<ResolutionPreview> {
    const { version, operationKey, summary, archiveCandidates } = await this.prepare(input);
    return { version, operationKey, summary, archiveCandidates };
  }

  async resolve(input: MarketResolutionInput, version: string) {
    const operationKey = this.operationKey(input);
    const receipt = await this.repository.receipt(operationKey);
    if (receipt) return receipt;
    const plan = await this.prepare(input);
    if (
      input.kind === "match" &&
      input.outcomeType !== "withdrawal" &&
      !plan.summary.matchId &&
      !input.allowUnlinked
    )
      throw new HttpError(400, "Select an archived match or explicitly publish without a link.");
    if (plan.version !== version)
      throw new HttpError(
        409,
        "The market changed. Review the refreshed preview before resolving.",
      );
    return this.repository.apply(plan);
  }

  async prepare(input: MarketResolutionInput): Promise<PreparedResolution> {
    const { markets, fixtures } = await this.context();
    const selected = markets.find((m) => m.id === input.marketId);
    if (!selected) throw new HttpError(404, "Market not found.");
    if (!["open", "closed"].includes(selected.status))
      throw new HttpError(409, "This market has already been settled.");
    const source = fixtureFor(selected, fixtures);
    if (source && input.kind !== "match")
      throw new HttpError(400, "Enter the match score so the bracket and points stay consistent.");
    if (!source && input.kind === "match")
      throw new HttpError(400, "This strike is not linked to a tournament match.");
    const eventFixtures = source ? fixtures.filter((f) => f.tournament === source.tournament) : [];
    const changedFixtures: PreparedResolution["fixtureChanges"] = [];
    const warnings: string[] = [];
    let archiveCandidates: ResolutionPreview["archiveCandidates"] = [];
    let winner: string | null = null;
    let eliminated: string | null = null;
    let champion: string | null = null;
    let playedOn: string | null = null;
    let matchId: string | null = null;
    let outcome: "yes" | "no" = input.kind === "binary" ? input.outcome : "yes";
    let method: Settlement["method"] =
      input.kind === "price" ? "price" : input.kind === "refund" ? "refund" : "binary";
    let updated = source;
    const today = new Date().toISOString().slice(0, 10);
    if (source && input.kind === "match") {
      if (!source.p1 || !source.p2 || lower(source.p1) === "bye" || lower(source.p2) === "bye")
        throw new HttpError(400, "Both match players must be known.");
      if (
        (source.s1 || source.s2 || source.played_on) &&
        (source.s1 !== input.score1 ||
          source.s2 !== input.score2 ||
          (source.played_on && source.played_on !== input.playedOn) ||
          (source.outcome_type || "played") !== input.outcomeType)
      )
        throw new HttpError(
          409,
          "The score must match the result already recorded in the bracket.",
        );
      if (input.playedOn > today)
        throw new HttpError(400, "A played match cannot have a future date.");
      if (input.outcomeType === "withdrawal" && input.score1 + input.score2 !== 1)
        throw new HttpError(400, "Record a withdrawal as 1–0 or 0–1.");
      playedOn = input.playedOn;
      updated = {
        ...source,
        s1: input.score1,
        s2: input.score2,
        played_on: playedOn,
        outcome_type: input.outcomeType === "played" ? "" : input.outcomeType,
      };
      winner = fixtureWinner(updated);
      const loser = winner === lower(source.p1) ? lower(source.p2) : lower(source.p1);
      outcome = lower(selected.outcome_yes_label) === winner ? "yes" : "no";
      if (lower(label(selected, outcome)) !== winner)
        throw new HttpError(400, "Market selections do not match the bracket players.");
      if (input.outcomeType !== "withdrawal") {
        try {
          const catalog = await this.repository.rows<CatalogRow & { match_mode: string }>(
            "tournament_catalog",
            "*",
            { id: source.tournament },
          );
          const archive = await findArchivedMatches(
            updated,
            catalog[0]?.match_mode || "blitz",
            input.playedOn,
            input.matchId,
          );
          archiveCandidates = archive.candidates.map((r) => ({
            matchId: r.match_id,
            date: archiveDate(r),
            score: `${input.score1}–${input.score2}`,
          }));
          if (archive.selected) {
            matchId = archive.selected.match_id;
            playedOn = archiveDate(archive.selected);
          } else
            warnings.push(
              archive.candidates.length > 1
                ? "Select the exact archived match."
                : "No matching archived match is available yet.",
            );
        } catch {
          warnings.push(
            "The match archive is unavailable. Retry, or explicitly publish without a link.",
          );
        }
        if (!matchId && !input.allowUnlinked)
          warnings.push(
            "Publishing is blocked until a match is selected or publishing without a link is enabled.",
          );
      }
      updated = { ...updated, played_on: playedOn, match_id: matchId || "" };
      changedFixtures.push({
        tournament: source.tournament,
        id: source.id,
        patch: {
          s1: updated.s1,
          s2: updated.s2,
          played_on: playedOn,
          match_id: matchId || "",
          outcome_type: updated.outcome_type,
        },
      });
      changedFixtures.push(...tournamentResultChanges(eventFixtures, updated));
      if (source.bracket === "losers" || (!source.loser_to && source.bracket !== "grand_final"))
        eliminated = loser;
      const championship = eventFixtures.filter(
        (f) => f.bracket === "grand_final" || /grand final/i.test(f.round),
      );
      if (/reset/i.test(source.round) || /reset/i.test(source.id)) champion = winner;
      else if (source.bracket === "grand_final" || /grand final/i.test(source.round)) {
        const upperFinal = eventFixtures.find(
          (f) => f.bracket === "main" && /^(final|finals)$/i.test(f.round),
        );
        if (
          !championship.some((f) => /reset/i.test(f.round + f.id)) ||
          (upperFinal && fixtureWinner(upperFinal) === winner)
        )
          champion = winner;
        else eliminated = null;
      } else if (
        source.bracket === "main" &&
        /^(final|finals)$/i.test(source.round) &&
        !championship.length
      )
        champion = winner;
    }
    if (input.kind === "binary" && exclusiveGroup(selected.group_id)) {
      if (input.outcome === "yes") champion = lower(title(selected));
      else eliminated = lower(title(selected));
    }

    const related = [selected];
    if (input.kind === "binary" && champion && exclusiveGroup(selected.group_id))
      related.push(
        ...markets.filter(
          (m) =>
            m.id !== selected.id &&
            m.group_id === selected.group_id &&
            ["open", "closed"].includes(m.status),
        ),
      );
    if (source && (champion || eliminated)) {
      const group = /^awc(\d{4})$/.exec(source.tournament)?.[1];
      if (group)
        related.push(
          ...markets.filter(
            (m) =>
              m.group_id === `awc-${group}-champion` &&
              ["open", "closed"].includes(m.status) &&
              (champion || lower(title(m)) === eliminated),
          ),
        );
    }
    const relatedMarkets = [...new Map(related.map((m) => [m.id, m])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const marketIds = relatedMarkets.map((m) => m.id);
    const [positions, credits, fills] = await Promise.all([
      this.repository.rows<Position>("prediction_positions", "*", { market_id: marketIds }, [
        "market_id",
        "username",
        "outcome",
      ]),
      this.repository.rows<Credit>(
        "prediction_position_credits",
        "*",
        { market_id: marketIds },
        "id",
      ),
      this.repository.rows<Fill>("prediction_fills", "*", { market_id: marketIds }),
    ]);
    const ledgerOwners = [...new Set(positions.map((p) => p.username))];
    const ledger = ledgerOwners.length
      ? await this.repository.rows<Ledger>("coin_transactions", "*", {
          username: ledgerOwners,
          reason: ["prediction_market_payout"],
        })
      : [];
    const chosenReference =
      input.kind === "price"
        ? input.referenceFillId
        : input.kind === "match"
          ? input.referenceFillId
          : undefined;
    const reference = chosenReference
      ? fills.find((f) => f.id === chosenReference && f.market_id === selected.id)
      : [...fills].filter((f) => f.market_id === selected.id).sort((a, b) => b.id - a.id)[0];
    if (input.kind === "match" && input.outcomeType === "withdrawal")
      method = reference ? "price" : "refund";
    if (method === "price" && !reference)
      throw new HttpError(400, "Choose a trade from this strike as the fair-price reference.");
    if (chosenReference && !reference)
      throw new HttpError(400, "That trade does not belong to this strike.");
    const settlements: Settlement[] = [];
    for (const market of relatedMarkets) {
      const isSelected = market.id === selected.id;
      const targetOutcome: "yes" | "no" = isSelected
        ? outcome
        : champion && lower(title(market)) === champion
          ? "yes"
          : "no";
      const targetMethod = isSelected ? method : "binary";
      const price =
        targetMethod === "price"
          ? reference!.outcome === "yes"
            ? reference!.price_cents
            : 100 - reference!.price_cents
          : targetOutcome === "yes"
            ? 100
            : 0;
      const refunds: Settlement["refunds"] = [];
      if (targetMethod === "refund") {
        if (fills.some((f) => f.market_id === market.id))
          throw new HttpError(
            400,
            "This market has trades. Choose a fair-price settlement instead of a full refund.",
          );
        for (const username of new Set(
          positions
            .filter((p) => p.market_id === market.id && p.quantity > 0)
            .map((p) => p.username),
        )) {
          const held = positions.filter(
            (p) => p.market_id === market.id && p.username === username,
          );
          if (username === "prediction_admin") {
            const yes = held.find((p) => p.outcome === "yes")?.quantity ?? 0;
            const no = held.find((p) => p.outcome === "no")?.quantity ?? 0;
            if (yes !== no)
              throw new HttpError(400, "Unpaired liquidity needs a fair-price settlement.");
            refunds.push({ username, amount: yes });
          } else {
            const ownerCredits = credits.filter(
              (c) => c.market_id === market.id && c.username === username,
            );
            const replay = replayPredictionPosition({
              username,
              fills: [] as PredictionPositionFill[],
              credits: ownerCredits.map((c) => ({
                ...c,
                credited_at: String(c.credited_at),
                fee_coins: c.fee_coins,
              })) as PredictionPositionCredit[],
              nettings: await this.repository.rows(
                "prediction_position_nettings",
                "id,quantity,created_at",
                { market_id: market.id, username },
              ),
            });
            const quantity = held.reduce((sum, p) => sum + p.quantity, 0);
            if (
              Math.abs(quantity - replay.positions.yes.quantity - replay.positions.no.quantity) >
              1e-6
            )
              throw new HttpError(400, "Imported holdings do not reconcile.");
            refunds.push({
              username,
              amount: Math.max(
                0,
                money((replay.positions.yes.costCents + replay.positions.no.costCents) / 100),
              ),
            });
          }
        }
      }
      const score = input.kind === "match" ? `${input.score1}–${input.score2}` : null;
      let message =
        isSelected && source && input.kind === "match"
          ? `${winner} ${input.outcomeType === "played" ? "won" : "advanced"} ${winner === lower(source.p1) ? score : `${input.score2}–${input.score1}`}.`
          : `${title(market)}: ${targetOutcome === "yes" ? "Yes" : "No"}.`;
      if (targetMethod === "price") message = `${title(market)} settled at ${price}¢.`;
      if (targetMethod === "refund") message = `${title(market)} was refunded.`;
      settlements.push({
        id: market.id,
        method: targetMethod,
        outcome: targetMethod === "binary" ? targetOutcome : null,
        price,
        referenceFillId: targetMethod === "price" ? reference!.id : null,
        message,
        refunds,
      });
    }
    const payments = new Map<string, number>();
    const pay = (user: string, amount: number) =>
      payments.set(user, money((payments.get(user) ?? 0) + amount));
    for (const settlement of settlements) {
      for (const p of positions.filter((p) => p.market_id === settlement.id && p.quantity > 0)) {
        if (settlement.method === "refund") continue;
        const gross = money(
          (p.quantity * (p.outcome === "yes" ? settlement.price : 100 - settlement.price)) / 100,
        );
        const receiptExists = ledger.some(
          (t) =>
            t.username === p.username &&
            t.source_key ===
              (settlement.method === "price"
                ? `prediction-market-price-payout:${p.market_id}:${p.username}:${p.outcome}`
                : `prediction-market-payout:${p.market_id}:${p.username}`),
        );
        pay(p.username, receiptExists ? 0 : gross);
      }
      for (const refund of settlement.refunds) pay(refund.username, refund.amount);
    }
    let expectedAwards: PointAward[] = [];
    let awards: PointAward[] = [];
    if (source && updated) {
      const [events, seeds, currentAwards] = await Promise.all([
        this.repository.rows<CatalogRow>("tournament_catalog", "*", { id: source.tournament }),
        this.repository.rows<{ player_name: string }>(
          "tournament_seeds",
          "player_name",
          { tournament: source.tournament },
          "player_name",
        ),
        this.repository.rows<PointAward>(
          "atomic_tour_point_awards",
          "award_key,tournament_id,player_name,source_type,source_key,awarded_on,expires_on,points,description",
          { tournament_id: source.tournament },
          "award_key",
        ),
      ]);
      expectedAwards = currentAwards;
      const nextFixtures = eventFixtures.map((f) =>
        changedFixtures
          .filter((c) => c.id === f.id)
          .reduce((row, c) => ({ ...row, ...c.patch }), f),
      );
      const event = events[0];
      if (!event) throw new HttpError(400, "Tournament catalog entry is missing.");
      awards = await knockoutAwards(
        event,
        nextFixtures,
        new Set(seeds.map((s) => lower(s.player_name))),
        today,
        (match, fallback) => {
          const fixture = nextFixtures.find((f) => f.match_id === match);
          return Promise.resolve(
            fixture?.played_on ||
              currentAwards.find((a) => a.source_key === fixture?.id)?.awarded_on ||
              fallback,
          );
        },
      );
      // Undated historical results use today's date as a fallback. Keep existing
      // award dates for players this result did not involve.
      awards = awards.map((award) => {
        const previous = currentAwards.find((a) => a.award_key === award.award_key);
        return previous &&
          ![lower(source.p1), lower(source.p2)].includes(award.player_name) &&
          previous.points === award.points &&
          previous.description === award.description
          ? previous
          : award;
      });
      awards.push(...currentAwards.filter((a) => a.source_type === "adjustment"));
      if (expectedAwards.length && !awards.length)
        throw new HttpError(400, "Atomic Tour scoring is not supported for this event.");
    }
    const pointTotals = (rows: PointAward[]) =>
      rows.reduce(
        (map, a) => map.set(a.player_name, (map.get(a.player_name) ?? 0) + a.points),
        new Map<string, number>(),
      );
    const before = pointTotals(expectedAwards),
      after = pointTotals(awards);
    const recipients = new Set<string>();
    for (const settlement of settlements) {
      for (const c of credits.filter((c) => c.market_id === settlement.id))
        if (c.username !== "prediction_admin") recipients.add(`${settlement.id}:${c.username}`);
      for (const p of positions.filter((p) => p.market_id === settlement.id && p.quantity > 0))
        if (p.username !== "prediction_admin") recipients.add(`${settlement.id}:${p.username}`);
      for (const f of fills.filter((f) => f.market_id === settlement.id))
        for (const u of [f.buyer_username, f.seller_username])
          if (u && u !== "prediction_admin") recipients.add(`${settlement.id}:${u}`);
    }
    const summary: ResolutionSummary = {
      marketTitles: relatedMarkets.map(title),
      winner,
      score:
        input.kind === "match"
          ? winner === lower(source?.p2)
            ? `${input.score2}–${input.score1}`
            : `${input.score1}–${input.score2}`
          : null,
      playedOn,
      matchId,
      bracketChanges: changedFixtures
        .filter((c) => c.id !== source?.id)
        .map((c) => {
          const f = eventFixtures.find((f) => f.id === c.id)!;
          return {
            id: c.id,
            playerOne: String(c.patch.p1 ?? f.p1 ?? ""),
            playerTwo: String(c.patch.p2 ?? f.p2 ?? ""),
          };
        }),
      pointChanges: [...new Set([...before.keys(), ...after.keys()])]
        .filter((u) => (before.get(u) ?? 0) !== (after.get(u) ?? 0))
        .map((username) => ({
          username,
          before: before.get(username) ?? 0,
          after: after.get(username) ?? 0,
        })),
      payouts: [...payments]
        .filter(([u, a]) => u !== "prediction_admin" && a > 0)
        .map(([username, amount]) => ({ username, amount })),
      notificationCount: recipients.size,
      warnings,
    };
    const plan = {
      actor: this.actor,
      input,
      operationKey: this.operationKey(input),
      eventId: source?.tournament ?? null,
      expectedFixtures: eventFixtures,
      fixtureChanges: changedFixtures,
      expectedMarkets: relatedMarkets,
      expectedPositions: positions,
      expectedAwards,
      awards,
      settlements,
      expectedPayments: [...payments].map(([username, amount]) => ({ username, amount })),
      summary,
      archiveCandidates,
    };
    return { ...plan, version: digest(plan) };
  }
}
