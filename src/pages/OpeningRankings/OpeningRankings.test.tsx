import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OpeningRankingsPage } from "./OpeningRankings";

vi.mock("../../components/Seo/Seo", () => ({ Seo: () => null }));

describe("OpeningRankingsPage", () => {
  it("shows one combined ranking with every first-move family represented", () => {
    render(<OpeningRankingsPage />);
    const section = screen.getByRole("region", { name: "Ranked openings" });

    expect(
      screen.getByText(/Openings are counted by meaningful choices for White/i),
    ).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "1. Nf3 f6 2. Nc3" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "1. Nh3 h6 2. d4" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "1. e3 e6 2. Nf3" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "1. d4" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "1. c4" })).toBeInTheDocument();
  });

  it("only expands the Nf3-f6, Nh3-h6, and e3-e6 branches", () => {
    render(<OpeningRankingsPage />);
    const moves = screen
      .getAllByRole("link")
      .map((link) => link.textContent ?? "")
      .filter((move) => move.startsWith("1. "));

    expect(moves).not.toContain("1. Nf3");
    expect(moves).not.toContain("1. Nh3");
    expect(moves).not.toContain("1. e3");
    expect(
      moves.every((move) => {
        const isVariation = move.split(" ").length > 2;
        return (
          !isVariation ||
          move.startsWith("1. Nf3 f6 2.") ||
          move.startsWith("1. Nh3 h6 2.") ||
          move.startsWith("1. e3 e6 2.")
        );
      }),
    ).toBe(true);
  });
});
