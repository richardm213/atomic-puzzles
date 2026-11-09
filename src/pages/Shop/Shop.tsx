import "./Shop.css";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import {
  faBorderAll,
  faCheck,
  faCircleInfo,
  faGlobe,
  faPalette,
  faUserPen,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { SHOP_ITEM_COSTS, SHOP_REOPENS_AT } from "../../../shared/domain/coins";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { type Theme, useAppSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import {
  coinQueryKeys,
  coinSummaryQueryOptions,
  redemptionHistoryQueryOptions,
} from "../../lib/coins/coinQueries";
import {
  claimDailyCoins,
  type CoinSummary,
  DAILY_COIN_BONUS,
  redeemShopItem,
  type RedemptionHistoryItem,
  type ShopItemKey,
} from "../../lib/coins/coins";
import { appAssetPath } from "../../utils/appAssetPath";
import { getErrorMessage } from "../../utils/errors";

const COIN_PRICE_IMAGE = "/images/coins/gold-coin-stack-v2.png";
const BAG_PRICE_IMAGE = "/images/coins/gold-coin-sack.png";

type ShopCategory = "all" | "discord" | "lichess" | "site";

type ShopItemIcon =
  | { kind: "fontawesome"; icon: IconDefinition }
  | { kind: "lichess" }
  | { kind: "emoji"; value: string };

const shopItems: {
  key: ShopItemKey;
  category: Exclude<ShopCategory, "all">;
  name: string;
  cost: number;
  icon: ShopItemIcon;
  priceImage: string;
  description?: string;
  theme?: Theme;
}[] = [
  {
    key: "theme_red_charcoal",
    theme: "ruby",
    category: "site",
    name: "Red Charcoal theme",
    cost: SHOP_ITEM_COSTS.theme_red_charcoal,
    icon: { kind: "fontawesome", icon: faPalette },
    priceImage: COIN_PRICE_IMAGE,
  },
  {
    key: "username_change",
    category: "site",
    name: "Change username",
    cost: SHOP_ITEM_COSTS.username_change,
    icon: { kind: "fontawesome", icon: faUserPen },
    priceImage: COIN_PRICE_IMAGE,
    description: "Admin approval required",
  },
  {
    key: "discord_nitro_month",
    category: "discord",
    name: "1 month Discord Nitro Basic",
    cost: SHOP_ITEM_COSTS.discord_nitro_month,
    icon: { kind: "fontawesome", icon: faDiscord },
    priceImage: COIN_PRICE_IMAGE,
  },
  {
    key: "discord_nitro_year",
    category: "discord",
    name: "1 year Discord Nitro Basic",
    cost: SHOP_ITEM_COSTS.discord_nitro_year,
    icon: { kind: "fontawesome", icon: faDiscord },
    priceImage: BAG_PRICE_IMAGE,
  },
  {
    key: "discord_nitro_full_month",
    category: "discord",
    name: "1 month Discord Nitro Nitro",
    cost: SHOP_ITEM_COSTS.discord_nitro_full_month,
    icon: { kind: "fontawesome", icon: faDiscord },
    priceImage: BAG_PRICE_IMAGE,
  },
  {
    key: "discord_nitro_full_year",
    category: "discord",
    name: "1 year Discord Nitro Nitro",
    cost: SHOP_ITEM_COSTS.discord_nitro_full_year,
    icon: { kind: "fontawesome", icon: faDiscord },
    priceImage: BAG_PRICE_IMAGE,
  },
  {
    key: "flowers_500",
    category: "discord",
    name: "500 Flowers",
    cost: SHOP_ITEM_COSTS.flowers_500,
    icon: { kind: "emoji", value: "🌸" },
    priceImage: COIN_PRICE_IMAGE,
  },
  {
    key: "lichess_patron_month",
    category: "lichess",
    name: "1 month Lichess Patron",
    cost: SHOP_ITEM_COSTS.lichess_patron_month,
    icon: { kind: "lichess" },
    priceImage: COIN_PRICE_IMAGE,
  },
];

const historicalShopItemNames: Partial<Record<ShopItemKey, string>> = {
  atomicdb_analysis_12h: "12-hour AtomicDB opening analysis",
  next_prize_tournament_format: "Choose the next 100$+ prize tournament format",
};

const shopCategories: { key: ShopCategory; label: string; icon: ShopItemIcon }[] = [
  { key: "all", label: "All", icon: { kind: "fontawesome", icon: faBorderAll } },
  { key: "discord", label: "Discord", icon: { kind: "fontawesome", icon: faDiscord } },
  { key: "lichess", label: "Lichess", icon: { kind: "lichess" } },
  { key: "site", label: "Site", icon: { kind: "fontawesome", icon: faGlobe } },
];

const ShopItemIcon = ({ icon }: { icon: ShopItemIcon }) => {
  if (icon.kind === "lichess") return <span className="lichessBrandIcon" />;
  if (icon.kind === "emoji") return <span className="shopItemEmoji">{icon.value}</span>;
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
  const [category, setCategory] = useState<ShopCategory>("all");
  const redeemDialogRef = useRef<HTMLDialogElement>(null);
  const purchaseToastTimeoutRef = useRef<number | null>(null);
  const [selectedReward, setSelectedReward] = useState<(typeof shopItems)[number] | null>(null);
  const [requestedUsername, setRequestedUsername] = useState("");
  const [purchaseToast, setPurchaseToast] = useState("");
  const [shopClosed, setShopClosed] = useState(() => Date.now() < Date.parse(SHOP_REOPENS_AT));
  const [dailyCountdown, setDailyCountdown] = useState(() =>
    formatCountdown(Math.max(0, Math.ceil((getNextDailyReset() - Date.now()) / 1000))),
  );
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const { setTheme } = useAppSettings();
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
  const updateSummary = (data: CoinSummary) => {
    queryClient.setQueryData<CoinSummary>(coinQueryKeys.summary(username), (current) => ({
      ...current,
      ...data,
    }));
  };
  const daily = useMutation({ mutationFn: claimDailyCoins, onSuccess: updateSummary });
  const redeem = useMutation({
    mutationFn: ({
      itemKey,
      requestedUsername: requested,
    }: {
      itemKey: ShopItemKey;
      requestedUsername?: string;
    }) => redeemShopItem(itemKey, requested),
    onMutate: (variables) => {
      const summaryKey = coinQueryKeys.summary(username);
      const historyKey = coinQueryKeys.redemptionHistory(username);
      const previousSummary = queryClient.getQueryData<CoinSummary>(summaryKey);
      const previousHistory = queryClient.getQueryData<RedemptionHistoryItem[]>(historyKey);
      void queryClient.cancelQueries({ queryKey: summaryKey }, { revert: false });
      void queryClient.cancelQueries({ queryKey: historyKey }, { revert: false });
      const item = shopItems.find((candidate) => candidate.key === variables.itemKey);
      const optimisticId = -Date.now();
      if (previousSummary && item) {
        queryClient.setQueryData<CoinSummary>(summaryKey, {
          ...previousSummary,
          balance: Math.max(0, previousSummary.balance - item.cost),
        });
      }
      if (previousHistory && item) {
        queryClient.setQueryData<RedemptionHistoryItem[]>(historyKey, [
          {
            id: optimisticId,
            itemKey: item.key,
            cost: item.cost,
            status: "pending",
            createdAt: new Date().toISOString(),
            fulfilledAt: null,
          },
          ...previousHistory,
        ]);
      }
      return { previousSummary, previousHistory, optimisticId };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(coinQueryKeys.summary(username), context.previousSummary);
      queryClient.setQueryData(coinQueryKeys.redemptionHistory(username), context.previousHistory);
    },
    onSuccess: (data, variables, context) => {
      updateSummary({ ...data, dailyClaimAvailable: summary.data?.dailyClaimAvailable ?? false });
      if (context && data.redemptionId) {
        queryClient.setQueryData<RedemptionHistoryItem[]>(
          coinQueryKeys.redemptionHistory(username),
          (current) =>
            current?.map((item) =>
              item.id === context.optimisticId
                ? {
                    ...item,
                    id: data.redemptionId!,
                    status: data.status === "fulfilled" ? "fulfilled" : item.status,
                  }
                : item,
            ),
        );
      }
      const purchasedItem = shopItems.find((item) => item.key === variables.itemKey);
      if (purchasedItem?.theme && data.status === "fulfilled") setTheme(purchasedItem.theme);
      setPurchaseToast(`${purchasedItem?.name ?? "Purchase"} confirmed`);
      if (purchaseToastTimeoutRef.current !== null) {
        window.clearTimeout(purchaseToastTimeoutRef.current);
      }
      purchaseToastTimeoutRef.current = window.setTimeout(() => {
        setPurchaseToast("");
        purchaseToastTimeoutRef.current = null;
      }, 3_600);
      setSelectedReward(null);
    },
    onSettled: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: coinQueryKeys.summary(username) }),
        queryClient.invalidateQueries({ queryKey: coinQueryKeys.redemptionHistory(username) }),
        queryClient.invalidateQueries({ queryKey: coinQueryKeys.rankings }),
        queryClient.invalidateQueries({ queryKey: ["coins", "transactions"] }),
      ]);
    },
  });
  const balance = summary.data?.balance ?? 0;
  const now = new Date();
  const unavailableItemKeys = new Set(
    redemptionHistory.data
      ?.filter((purchase) => {
        if (purchase.id <= 0 || purchase.status === "cancelled") return false;
        const item = shopItems.find((candidate) => candidate.key === purchase.itemKey);
        if (item?.theme) return purchase.status === "fulfilled";
        const purchasedAt = new Date(purchase.createdAt);
        return (
          purchase.itemKey === "lichess_patron_month" &&
          purchasedAt.getUTCFullYear() === now.getUTCFullYear() &&
          purchasedAt.getUTCMonth() === now.getUTCMonth()
        );
      })
      .map((purchase) => purchase.itemKey),
  );
  const economyBan = summary.data?.economyBan ?? null;
  const busy = daily.isPending || redeem.isPending;
  const errorValue = summary.error ?? daily.error ?? redeem.error;
  const error = getErrorMessage(errorValue, "");

  const redeemItem = (item: (typeof shopItems)[number]) => {
    if (
      unavailableItemKeys.has(item.key) ||
      shopClosed ||
      balance < item.cost ||
      busy ||
      economyBan
    )
      return;
    redeem.reset();
    setRequestedUsername("");
    setSelectedReward(item);
  };

  const closeRedeemDialog = () => {
    if (!redeem.isPending) setSelectedReward(null);
  };

  const confirmRedemption = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (shopClosed || !selectedReward || balance < selectedReward.cost || busy || economyBan) {
      return;
    }
    const requested = requestedUsername.trim();
    if (selectedReward.key === "username_change" && !/^[A-Za-z0-9_-]{3,30}$/.test(requested)) {
      return;
    }
    redeem.mutate({
      itemKey: selectedReward.key,
      ...(selectedReward.key === "username_change" ? { requestedUsername: requested } : {}),
    });
  };

  useEffect(() => {
    return () => {
      if (purchaseToastTimeoutRef.current !== null) {
        window.clearTimeout(purchaseToastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!shopClosed) return undefined;
    const remaining = Math.max(0, Date.parse(SHOP_REOPENS_AT) - Date.now());
    const timeoutId = window.setTimeout(() => setShopClosed(false), remaining + 100);
    return () => window.clearTimeout(timeoutId);
  }, [shopClosed]);

  useEffect(() => {
    const dialog = redeemDialogRef.current;
    if (!dialog) return;
    if (selectedReward && !dialog.open) dialog.showModal();
    if (!selectedReward && dialog.open) dialog.close();
  }, [selectedReward]);

  useEffect(() => {
    if (summary.data?.dailyClaimAvailable !== false || economyBan) return undefined;

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
  }, [economyBan, queryClient, summary.data?.dailyClaimAvailable, username]);

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
          How to earn coins
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
          <form className="redeemDialogContent" onSubmit={confirmRedemption}>
            <img src={appAssetPath(selectedReward.priceImage)} alt="" aria-hidden="true" />
            <div className="redeemDialogCopy">
              <h2 id="redeem-dialog-title">Buy {selectedReward.name}?</h2>
              {selectedReward.key === "username_change" ? (
                <label className="usernameChangeField">
                  Requested username
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[A-Za-z0-9_-]+"
                    autoComplete="off"
                    spellCheck={false}
                    value={requestedUsername}
                    onChange={(event) => setRequestedUsername(event.target.value)}
                  />
                  <small>
                    Letters, numbers, underscores, and hyphens. An admin will review it.
                  </small>
                </label>
              ) : null}
              {redeem.error ? (
                <p className="redeemDialogError" role="alert">
                  {getErrorMessage(redeem.error, "Unable to complete this purchase.")}
                </p>
              ) : null}
            </div>
            <div className="redeemDialogActions">
              <button
                className="redeemDialogCancel"
                type="button"
                disabled={redeem.isPending}
                onClick={closeRedeemDialog}
              >
                Cancel
              </button>
              <button className="redeemDialogConfirm" type="submit" disabled={redeem.isPending}>
                {redeem.isPending ? "Buying…" : `Buy for ${selectedReward.cost.toLocaleString()}`}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

      {purchaseToast ? (
        <div className="shopPurchaseToast" role="status" aria-live="polite">
          <span aria-hidden="true">
            <FontAwesomeIcon icon={faCheck} />
          </span>
          <div>
            <strong>Purchased</strong>
            <small>{purchaseToast}</small>
          </div>
        </div>
      ) : null}

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
                <strong>{formatCoinBalance(balance)}</strong>
                <span>coins</span>
              </div>
            </div>
            <div className="dailyCoinPanel">
              {summary.data?.dailyClaimAvailable === false && !economyBan ? (
                <p>Next in {dailyCountdown}</p>
              ) : null}
              <button
                className={`dailyClaimButton ${
                  summary.data?.dailyClaimAvailable === false ? "claimed" : ""
                } ${daily.isPending ? "claiming" : ""}`}
                type="button"
                disabled={!summary.data?.dailyClaimAvailable || busy || Boolean(economyBan)}
                onClick={() => daily.mutate()}
              >
                {daily.isPending ? (
                  "Claiming…"
                ) : summary.isLoading ? (
                  "Loading…"
                ) : economyBan ? (
                  "Suspended"
                ) : summary.data?.dailyClaimAvailable ? (
                  `Claim +${DAILY_COIN_BONUS}`
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                    Claimed
                  </>
                )}
              </button>
            </div>
          </section>

          {shopClosed ? (
            <section className="shopClosureNotice" aria-labelledby="shop-closure-title">
              <h2 id="shop-closure-title">Shop temporarily closed</h2>
              <p>
                Purchases reopen automatically on <time dateTime={SHOP_REOPENS_AT}>November 3</time>
                at 00:00 UTC.
              </p>
            </section>
          ) : null}

          {economyBan ? (
            <section className="coinEconomyBanNotice" aria-labelledby="coin-ban-title">
              <h2 id="coin-ban-title">Coin access suspended</h2>
              <p>{economyBan.reason}</p>
              <p>
                <span>Access returns </span>
                <time dateTime={economyBan.endsAt}>
                  {redemptionDateFormatter.format(new Date(economyBan.endsAt))}
                </time>
                .
              </p>
            </section>
          ) : null}

          {error ? (
            <p className="coinShopError" role="alert">
              {error}
            </p>
          ) : null}
          <section className="coinRewards" aria-labelledby="coin-rewards-title">
            <div className="shopRewardsHeader">
              <h2 id="coin-rewards-title">Rewards</h2>
              <div className="shopCategoryFilters" role="group" aria-label="Shop category">
                {shopCategories.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    aria-pressed={category === entry.key}
                    onClick={() => setCategory(entry.key)}
                  >
                    <span aria-hidden="true">
                      <ShopItemIcon icon={entry.icon} />
                    </span>
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="shopItems">
              {shopItems
                .filter(
                  (item) =>
                    !unavailableItemKeys.has(item.key) &&
                    (category === "all" || item.category === category),
                )
                .sort((a, b) => a.cost - b.cost)
                .map((item) => (
                  <article className="shopItem" key={item.key}>
                    <div className="shopItemTopRow">
                      <div className="shopItemArt" aria-hidden="true">
                        <ShopItemIcon icon={item.icon} />
                      </div>
                      <span className="shopItemPrice">
                        <img
                          className={
                            item.key === "discord_nitro_year" ||
                            item.key === "discord_nitro_full_year"
                              ? "premiumPriceImage"
                              : ""
                          }
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
                      disabled={shopClosed || balance < item.cost || busy || Boolean(economyBan)}
                      onClick={() => redeemItem(item)}
                    >
                      {shopClosed
                        ? "Closed"
                        : redeem.isPending && redeem.variables?.itemKey === item.key
                          ? "Buying…"
                          : "Buy"}
                    </button>
                  </article>
                ))}
            </div>
          </section>

          <section className="redemptionHistory" aria-labelledby="redemption-history-title">
            <h2 id="redemption-history-title">Purchase history</h2>
            {redemptionHistory.isLoading ? (
              <p className="redemptionHistoryState" role="status">
                Loading purchases…
              </p>
            ) : redemptionHistory.isError ? (
              <p className="redemptionHistoryState coinShopError" role="alert">
                Unable to load purchase history.
              </p>
            ) : redemptionHistory.data?.length ? (
              <ol className="redemptionHistoryList">
                {redemptionHistory.data.map((redemption) => {
                  const item = shopItems.find((candidate) => candidate.key === redemption.itemKey);
                  return (
                    <li key={redemption.id}>
                      <div>
                        <strong>
                          {item?.name ??
                            historicalShopItemNames[redemption.itemKey] ??
                            redemption.itemKey}
                        </strong>
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
              <p className="redemptionHistoryState">You haven’t bought anything yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
};
