import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { RouteNotFoundFallback } from "./RouteFallback";

it("marks a missing route as noindex without carrying the directive to a valid page", async () => {
  const rootRoute = createRootRoute({
    component: Outlet,
    notFoundComponent: RouteNotFoundFallback,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <h1>Home</h1>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/missing"] }),
  });

  render(<RouterProvider router={router} />);
  const noIndex = () => document.head.querySelector('meta[name="robots"][content="noindex"]');
  const homeLink = await screen.findByRole("link", { name: "Go home" });
  expect(noIndex()).not.toBeNull();
  fireEvent.click(homeLink);
  await screen.findByRole("heading", { name: "Home" });
  expect(noIndex()).toBeNull();
});
