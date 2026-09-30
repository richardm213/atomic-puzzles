import "./Shop.css";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { faCheck, faCircleInfo, faDatabase, faSitemap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  coinQueryKeys,
  coinSummaryQueryOptions,
  redemptionHistoryQueryOptions,
} from "../../lib/coins/coinQueries";
import {
  claimDailyCoins,
  redeemShopItem,
  requestAtomicDbAnalysis,
  type ShopItemKey,
} from "../../lib/coins/coins";
import { appAssetPath } from "../../utils/appAssetPath";
import { NadekoFlowersIcon } from "./NadekoFlowersIcon";

const CHEST_PRICE_IMAGE = "/images/coins/gold-coin-chest.png";

type ShopItemIcon =
  { kind: "fontawesome"; icon: IconDefinition } | { kind: "lichess" } | { kind: "nadeko-flowers" };

const shopItems: {
  key: ShopItemKey;
  name: string;
  cost: number;
  icon: ShopItemIcon;
  priceImage: string;
  description?: string;
}[] = [
  {
    key: "atomicdb_analysis_12h",
    name: "12-hour AtomicDB opening analysis",
    cost: 200,
    icon: { kind: "fontawesome", icon: faDatabase },
    priceImage: "/images/coins/gold-coin-stack-v2.png",
    description: "Push opening sequences deeper or cover lines from selected players.",
  },
  {
    key: "discord_nitro_month",
    name: "1 month Discord Nitro",
    cost: 400,
    icon: { kind: "fontawesome", icon: faDiscord },
    priceImage: CHEST_PRICE_IMAGE,
  },
  {
    key: "discord_nitro_year",
    name: "1 year Discord Nitro",
    cost: 4000,
    icon: { kind: "fontawesome", icon: faDiscord },
    priceImage: "/images/coins/gold-coin-sack.png",
  },
  {
    key: "flowers_500",
    name: "500 Flowers",
    cost: 500,
    icon: { kind: "nadeko-flowers" },
    priceImage: CHEST_PRICE_IMAGE,
  },
  {
    key: "lichess_patron_month",
    name: "1 month Lichess Patron",
    cost: 600,
    icon: { kind: "lichess" },
    priceImage: CHEST_PRICE_IMAGE,
  },
  {
    key: "next_prize_tournament_format",
    name: "Choose the next 100$+ prize tournament format",
    cost: 1000,
    icon: { kind: "fontawesome", icon: faSitemap },
    priceImage: CHEST_PRICE_IMAGE,
  },
];

const ShopItemIcon = ({ icon }: { icon: ShopItemIcon }) => {
  if (icon.kind === "lichess") return <span className="lichessBrandIcon" />;
  if (icon.kind === "nadeko-flowers") return <NadekoFlowersIcon className="nadekoFlowersIcon" />;
  return <FontAwesomeIcon icon={icon.icon} />;
};

const getNextDailyReset = (): number => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
};

const formatCountdown = (remainingSeconds: number): string => {
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
};

const redemptionDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const ShopPage = () => {
  const redeemDialogRef = useRef<HTMLDialogElement>(null);
  const analysisDialogRef = useRef<HTMLDialogElement>(null);
  const [selectedReward, setSelectedReward] = useState<(typeof shopItems)[number] | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisFocus, setAnalysisFocus] = useState<"higher_eval" | "player_lines">("higher_eval");
  const [openingInputs, setOpeningInputs] = useState([""]);
  const [playerInputs, setPlayerInputs] = useState([""]);
  const [dailyCountdown, setDailyCountdown] = useState(() =>
    formatCountdown(Math.max(0, Math.ceil((getNextDailyReset() - Date.now()) / 1000))),
  );
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const queryClient = useQueryClient();
  const username = user?.username ?? "anonymous";
  const summary = useQuery({
    ...coinSummaryQueryOptions(username),
    enabled: isAuthenticated,
  });
  const redemptionHistory = useQuery({
    ...redemptionHistoryQueryOptions(username),
    enabled: isAuthenticated,
  });
  const updateSummary = (data: { balance: number; dailyClaimAvailable: boolean }) => {
    queryClient.setQueryData(coinQueryKeys.summary(username), data);
  };
  const daily = useMutation({ mutationFn: claimDailyCoins, onSuccess: updateSummary });
  const redeem = useMutation({
    mutationFn: redeemShopItem,
    onSuccess: (data) => {
      updateSummary({ ...data, dailyClaimAvailable: summary.data?.dailyClaimAvailable ?? false });
      void queryClient.invalidateQueries({
        queryKey: coinQueryKeys.redemptionHistory(username),
      });
    },
  });
  const analysis = useMutation({
    mutationFn: requestAtomicDbAnalysis,
    onSuccess: (data) => {
      updateSummary({ ...data, dailyClaimAvailable: summary.data?.dailyClaimAvailable ?? false });
      setAnalysisOpen(false);
    },
  });
  const balance = summary.data?.balance ?? 0;
  const busy = daily.isPending || redeem.isPending || analysis.isPending;
  const errorValue = summary.error ?? daily.error ?? redeem.error ?? analysis.error;
  const error = errorValue instanceof Error ? errorValue.message : "";

  const redeemItem = (item: (typeof shopItems)[number]) => {
    if (balance < item.cost || busy) return;
    if (item.key === "atomicdb_analysis_12h") {
      analysis.reset();
      setAnalysisFocus("higher_eval");
      setOpeningInputs([""]);
      setPlayerInputs([""]);
      setAnalysisOpen(true);
      return;
    }
    setSelectedReward(item);
  };

  const closeRedeemDialog = () => setSelectedReward(null);

  const confirmRedemption = () => {
    if (!selectedReward || balance < selectedReward.cost || busy) return;
    redeem.mutate(selectedReward.key);
    closeRedeemDialog();
  };

  const closeAnalysisDialog = () => {
    if (!analysis.isPending) setAnalysisOpen(false);
  };

  const updateInput = (
    setter: typeof setOpeningInputs,
    values: string[],
    index: number,
    value: string,
  ) => setter(values.map((current, currentIndex) => (currentIndex === index ? value : current)));

  const submitAnalysisRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const openings = openingInputs.map((value) => value.trim()).filter(Boolean);
    const players = playerInputs.map((value) => value.trim()).filter(Boolean);
    if (analysisFocus === "higher_eval") {
      if (!openings.length) return;
      analysis.mutate({ focus: "higher_eval", openings });
      return;
    }
    if (!openings[0] || !players.length) return;
    analysis.mutate({ focus: "player_lines", openings: [openings[0]], players });
  };

  useEffect(() => {
    const dialog = redeemDialogRef.current;
    if (!dialog) return;
    if (selectedReward && !dialog.open) dialog.showModal();
    if (!selectedReward && dialog.open) dialog.close();
  }, [selectedReward]);

  useEffect(() => {
    const dialog = analysisDialogRef.current;
    if (!dialog) return;
    if (analysisOpen && !dialog.open) dialog.showModal();
    if (!analysisOpen && dialog.open) dialog.close();
  }, [analysisOpen]);

  useEffect(() => {
    if (summary.data?.dailyClaimAvailable !== false) return undefined;

    const resetAt = getNextDailyReset();
    let resetReached = false;
    const updateCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
      setDailyCountdown(formatCountdown(remainingSeconds));
      if (remainingSeconds === 0 && !resetReached) {
        resetReached = true;
        void queryClient.invalidateQueries({ queryKey: coinQueryKeys.summary(username) });
      }
    };
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [queryClient, summary.data?.dailyClaimAvailable, username]);

  if (isLoading) return <RouteLoadingFallback />;

  return (
    <div className="page coinShopPage">
      <Seo
        title="Shop"
        description="Earn Atomic Coins by creating and solving puzzles."
        path="/shop"
      />
      <header className="coinShopHeader">
        <h1>Shop</h1>
        <Link className="coinHelpLink" to="/shop/how-coins-work">
          <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
          How do coins work?
        </Link>
      </header>

      <dialog
        ref={redeemDialogRef}
        className="redeemDialog"
        aria-labelledby="redeem-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeRedeemDialog();
        }}
        onClickCapture={(event) => {
          if (event.target === event.currentTarget) closeRedeemDialog();
        }}
      >
        {selectedReward ? (
          <div className="redeemDialogContent">
            <img src={appAssetPath(selectedReward.priceImage)} alt="" aria-hidden="true" />
            <div className="redeemDialogCopy">
              <h2 id="redeem-dialog-title">Redeem {selectedReward.name}?</h2>
            </div>
            <div className="redeemDialogActions">
              <button className="redeemDialogCancel" type="button" onClick={closeRedeemDialog}>
                Cancel
              </button>
              <button className="redeemDialogConfirm" type="button" onClick={confirmRedemption}>
                Redeem for {selectedReward.cost.toLocaleString()}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>

      <dialog
        ref={analysisDialogRef}
        className="analysisRequestDialog"
        aria-labelledby="analysis-request-title"
        onCancel={(event) => {
          if (analysis.isPending) event.preventDefault();
          else setAnalysisOpen(false);
        }}
        onClickCapture={(event) => {
          if (event.target === event.currentTarget) closeAnalysisDialog();
        }}
      >
        <form className="analysisRequestForm" onSubmit={submitAnalysisRequest}>
          <header>
            <div>
              <h2 id="analysis-request-title">Request AtomicDB analysis</h2>
              <p>Choose how the 12-hour analysis should be used.</p>
            </div>
            <span className="analysisRequestPrice">
              <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />
              200
            </span>
          </header>

          <fieldset className="analysisFocusOptions">
            <legend>Analysis focus</legend>
            <label
              htmlFor="analysis-focus-higher-eval"
              aria-label="Push for higher evaluation"
              className={analysisFocus === "higher_eval" ? "selected" : ""}
            >
              <input
                id="analysis-focus-higher-eval"
                type="radio"
                name="analysis-focus"
                value="higher_eval"
                checked={analysisFocus === "higher_eval"}
                onChange={() => {
                  analysis.reset();
                  setAnalysisFocus("higher_eval");
                  setOpeningInputs((current) => current.slice(0, 5));
                }}
              />
              <span>
                <strong>Push for higher evaluation</strong>
                <small>Submit up to five opening sequences for deeper analysis.</small>
              </span>
            </label>
            <label
              htmlFor="analysis-focus-player-lines"
              aria-label="Cover player database lines"
              className={analysisFocus === "player_lines" ? "selected" : ""}
            >
              <input
                id="analysis-focus-player-lines"
                type="radio"
                name="analysis-focus"
                value="player_lines"
                checked={analysisFocus === "player_lines"}
                onChange={() => {
                  analysis.reset();
                  setAnalysisFocus("player_lines");
                  setOpeningInputs((current) => [current[0] ?? ""]);
                }}
              />
              <span>
                <strong>Cover player database lines</strong>
                <small>Analyze one opening across up to ten players.</small>
              </span>
            </label>
          </fieldset>

          <div className="analysisRequestFields">
            <div className="analysisDynamicHeader">
              <div>
                <strong>{analysisFocus === "higher_eval" ? "Opening sequences" : "Opening"}</strong>
                <span>AtomicDB URL, FEN, or moves</span>
              </div>
              {analysisFocus === "higher_eval" && openingInputs.length < 5 ? (
                <button
                  type="button"
                  onClick={() => setOpeningInputs((current) => [...current, ""])}
                >
                  Add opening
                </button>
              ) : null}
            </div>
            {openingInputs.map((value, index) => (
              <label className="analysisTextField" key={`opening-${index}`}>
                <span>Opening {analysisFocus === "higher_eval" ? index + 1 : ""}</span>
                <span className="analysisInputRow">
                  <input
                    type="text"
                    value={value}
                    required={index === 0}
                    maxLength={1000}
                    placeholder="Paste a URL, FEN, or move sequence"
                    onChange={(event) =>
                      updateInput(setOpeningInputs, openingInputs, index, event.target.value)
                    }
                  />
                  {analysisFocus === "higher_eval" && openingInputs.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove opening ${index + 1}`}
                      onClick={() =>
                        setOpeningInputs((current) =>
                          current.filter((_, currentIndex) => currentIndex !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </span>
              </label>
            ))}

            {analysisFocus === "player_lines" ? (
              <>
                <div className="analysisDynamicHeader">
                  <div>
                    <strong>Players</strong>
                    <span>Lichess usernames</span>
                  </div>
                  {playerInputs.length < 10 ? (
                    <button
                      type="button"
                      onClick={() => setPlayerInputs((current) => [...current, ""])}
                    >
                      Add player
                    </button>
                  ) : null}
                </div>
                {playerInputs.map((value, index) => (
                  <label className="analysisTextField" key={`player-${index}`}>
                    <span>Player {index + 1}</span>
                    <span className="analysisInputRow">
                      <input
                        type="text"
                        value={value}
                        required={index === 0}
                        maxLength={50}
                        pattern="[A-Za-z0-9_-]+"
                        placeholder="Lichess username"
                        autoComplete="off"
                        onChange={(event) =>
                          updateInput(setPlayerInputs, playerInputs, index, event.target.value)
                        }
                      />
                      {playerInputs.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove player ${index + 1}`}
                          onClick={() =>
                            setPlayerInputs((current) =>
                              current.filter((_, currentIndex) => currentIndex !== index),
                            )
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                    </span>
                  </label>
                ))}
              </>
            ) : null}
          </div>

          {analysis.isError ? (
            <p className="analysisRequestError" role="alert">
              {analysis.error instanceof Error
                ? analysis.error.message
                : "Unable to request this analysis."}
            </p>
          ) : null}

          <footer>
            <button type="button" disabled={analysis.isPending} onClick={closeAnalysisDialog}>
              Cancel
            </button>
            <button type="submit" disabled={analysis.isPending}>
              {analysis.isPending ? "Requesting…" : "Request for 200 coins"}
            </button>
          </footer>
        </form>
      </dialog>

      {!isAuthenticated ? (
        <section className="panel coinShopGate">
          <h2>Log in to earn coins</h2>
          <button type="button" onClick={() => void login("/shop")}>
            Log in with Lichess
          </button>
        </section>
      ) : (
        <>
          <section className="coinWalletPanel" aria-label="Coin balance and daily bonus">
            <div className="coinBalanceCard" aria-live="polite">
              <img
                src={appAssetPath("/images/coins/gold-coin-stack-v2.png")}
                alt=""
                aria-hidden="true"
              />
              <div>
                <strong>{balance.toLocaleString()}</strong>
                <span>coins</span>
              </div>
            </div>
            <div className="dailyCoinPanel">
              {summary.data?.dailyClaimAvailable === false ? <p>Next in {dailyCountdown}</p> : null}
              <button
                className={`dailyClaimButton ${
                  summary.data?.dailyClaimAvailable === false ? "claimed" : ""
                } ${daily.isPending ? "claiming" : ""}`}
                type="button"
                disabled={!summary.data?.dailyClaimAvailable || busy}
                onClick={() => daily.mutate()}
              >
                {daily.isPending ? (
                  "Claiming…"
                ) : summary.isLoading ? (
                  "Loading…"
                ) : summary.data?.dailyClaimAvailable ? (
                  "Claim +5"
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                    Claimed
                  </>
                )}
              </button>
            </div>
          </section>

          {error ? (
            <p className="coinShopError" role="alert">
              {error}
            </p>
          ) : null}
          {redeem.isSuccess ? (
            <p className="coinShopSuccess" role="status">
              Redemption sent. An admin has been notified.
            </p>
          ) : null}
          {analysis.isSuccess ? (
            <p className="coinShopSuccess" role="status">
              Analysis requested. An admin has been notified.
            </p>
          ) : null}

          <section className="coinRewards" aria-labelledby="coin-rewards-title">
            <h2 id="coin-rewards-title">Rewards</h2>
            <div className="shopItems">
              {shopItems.map((item) => (
                <article className="shopItem" key={item.key}>
                  <div className="shopItemTopRow">
                    <div className="shopItemArt" aria-hidden="true">
                      <ShopItemIcon icon={item.icon} />
                    </div>
                    <span className="shopItemPrice">
                      <img
                        className={item.key === "discord_nitro_year" ? "premiumPriceImage" : ""}
                        src={appAssetPath(item.priceImage)}
                        alt=""
                      />
                      {item.cost.toLocaleString()}
                    </span>
                  </div>
                  <div className="shopItemCopy">
                    <h3>{item.name}</h3>
                    {item.description ? <p>{item.description}</p> : null}
                  </div>
                  <button
                    type="button"
                    disabled={balance < item.cost || busy}
                    onClick={() => redeemItem(item)}
                  >
                    {item.key === "atomicdb_analysis_12h"
                      ? "Request"
                      : redeem.isPending && redeem.variables === item.key
                        ? "Redeeming…"
                        : "Redeem"}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="redemptionHistory" aria-labelledby="redemption-history-title">
            <h2 id="redemption-history-title">Redemption history</h2>
            {redemptionHistory.isLoading ? (
              <p className="redemptionHistoryState" role="status">
                Loading redemptions…
              </p>
            ) : redemptionHistory.isError ? (
              <p className="redemptionHistoryState coinShopError" role="alert">
                Unable to load redemption history.
              </p>
            ) : redemptionHistory.data?.length ? (
              <ol className="redemptionHistoryList">
                {redemptionHistory.data.map((redemption) => {
                  const item = shopItems.find((candidate) => candidate.key === redemption.itemKey);
                  return (
                    <li key={redemption.id}>
                      <div>
                        <strong>{item?.name ?? redemption.itemKey}</strong>
                        <time dateTime={redemption.createdAt}>
                          {redemptionDateFormatter.format(new Date(redemption.createdAt))}
                        </time>
                      </div>
                      <div className="redemptionHistoryMeta">
                        <span className={`redemptionStatus ${redemption.status}`}>
                          {redemption.status}
                        </span>
                        <span>{redemption.cost.toLocaleString()} coins</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="redemptionHistoryState">You haven’t redeemed anything yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
};
