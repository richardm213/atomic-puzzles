import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoinProfileActions } from "./CoinProfileActions";

let viewerUsername = "recipient_alt";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { username: viewerUsername },
  }),
}));

afterEach(cleanup);

const renderActions = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CoinProfileActions
        recipientUsername="registered_alt"
        recipientAliases={["canonical_recipient", "recipient_alt", "registered_alt"]}
        displayUsername="canonical_recipient"
      />
    </QueryClientProvider>,
  );

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
});
