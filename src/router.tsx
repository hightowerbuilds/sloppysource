import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./components/RootLayout.tsx";
import { supabase } from "./lib/supabase.ts";

async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw redirect({ to: "/login" });
  }
  return session;
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

const viewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/doc/$docId",
  beforeLoad: async () => {
    await requireAuth();
  },
}).lazy(() => import("./pages/ViewerPage.tsx").then((m) => m.Route));

const routeTree = rootRoute.addChildren([loginRoute, homeRoute, viewerRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
