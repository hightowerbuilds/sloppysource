import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./components/RootLayout.tsx";
import { supabase } from "./lib/supabase.ts";

async function requireAuth() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw redirect({ to: "/login" });
  }
  return user;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
}).lazy(() => import("./pages/LoginPage.tsx").then((m) => m.Route));

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    await requireAuth();
  },
}).lazy(() => import("./pages/HomePage.tsx").then((m) => m.Route));

const displayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/display",
  beforeLoad: async () => {
    await requireAuth();
  },
}).lazy(() => import("./pages/ViewerPage.tsx").then((m) => m.Route));

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  beforeLoad: async () => {
    await requireAuth();
  },
}).lazy(() => import("./pages/SearchPage.tsx").then((m) => m.Route));

const routeTree = rootRoute.addChildren([loginRoute, homeRoute, displayRoute, searchRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
