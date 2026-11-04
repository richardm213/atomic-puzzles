import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { coinQueryKeys } from "../../lib/coins/coinQueries";
import { CoinProfileActions } from "./CoinProfileActions";

let viewerUsername = "recipient_alt";
const mocks = vi.hoisted(() => ({ giveCoins: vi.fn() }));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { username: viewerUsername },
  }),
}));

vi.mock("../../lib/coins/coins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/coins/coins")>()),
  giveCoins: mocks.giveCoins,
}));

afterEach(cleanup);
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
});
beforeEach(() => mocks.giveCoins.mockReset());

const renderActions = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <CoinProfileActions
        recipientUsername="registered_alt"
        recipientAliases={["canonical_recipient", "recipient_alt", "registered_alt"]}
        displayUsername="canonical_recipient"
      />
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient };
};

describe("coin gift eligibility", () => {
  it("offers gifts to another registered identity but not to one of the viewer's own aliases", () => {
    viewerUsername = "recipient_alt";
    const ownIdentity = renderActions();
    expect(screen.queryByRole("button", { name: "Give coins" })).not.toBeInTheDocument();

    ownIdentity.unmount();
    viewerUsername = "different_player";
    renderActions();
    expect(screen.getByRole("button", { name: "Give coins" })).toBeInTheDocument();
  });

  it("updates the cached balance before the gift request finishes", async () => {
    viewerUsername = "different_player";
    let finishGift!: (value: unknown) => void;
    mocks.giveCoins.mockReturnValue(new Promise((resolve) => (finishGift = resolve)));
    const { queryClient } = renderActions();
    queryClient.setQueryData(coinQueryKeys.summary(viewerUsername), {
      balance: 100,
      dailyClaimAvailable: false,
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Give coins" }));
    await user.click(screen.getByRole("button", { name: "Give 10 coins" }));

    expect(queryClient.getQueryData(coinQueryKeys.summary(viewerUsername))).toMatchObject({
      balance: 90,
    });
    expect(mocks.giveCoins).toHaveBeenCalledOnce();

    finishGift({ balance: 90, dailyClaimAvailable: false });
  });
});
