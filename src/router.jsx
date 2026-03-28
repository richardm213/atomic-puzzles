import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { App } from "./App";
import { HomePage } from "./pages/Home";
import { RankingsPage } from "./pages/Rankings";
import { RecentMatchesPage } from "./pages/RecentMatches";
import { PlayerProfilePage } from "./pages/PlayerProfile";
import { PuzzleSolverPage } from "./pages/PuzzleSolver";
import { H2HPage } from "./pages/H2H";

const appBasePath = (() => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "/";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
})();

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const rankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings",
  component: RankingsPage,
});

const recentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recent",
  component: RecentMatchesPage,
});

const h2hRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/h2h",
  component: H2HPage,
});

const h2hMatchupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/h2h/$matchup",
  component: H2HPage,
});

const matchesAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/matches",
  beforeLoad: () => {
    throw redirect({ to: "/recent" });
  },
});

const solveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve",
  component: PuzzleSolverPage,
});

const solveWithIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/$puzzleId",
  component: PuzzleSolverPage,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username",
  component: function ProfileRoute() {
    const { username } = useParams({ strict: false });
    return <PlayerProfilePage username={username} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  rankingsRoute,
  recentRoute,
  h2hRoute,
  h2hMatchupRoute,
  matchesAliasRoute,
  solveRoute,
  solveWithIdRoute,
  profileRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: appBasePath,
});

export const AppRouterProvider = () => <RouterProvider router={router} />;
