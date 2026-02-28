import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "../lib/supabase.ts";
import "../App.css";

export function RootLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    await navigate({ to: "/login" });
  }

  const username = user?.user_metadata?.username as string | undefined;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOnDocPage = pathname.startsWith("/doc/");

  return (
    <main className="app-shell">
      <header className="navbar">
        <p className="brand">sloppysource.dev</p>
        {user ? (
          <nav className="nav-links">
            <Link to="/" className="nav-button" activeOptions={{ exact: true }}>
              List
            </Link>
            <span
              className={`nav-button${isOnDocPage ? " is-active" : " is-disabled"}`}
            >
              Display
            </span>
            <span className="nav-separator" />
            <span className="nav-user">{username ?? "User"}</span>
            <button
              className="nav-button"
              type="button"
              onClick={() => void handleLogout()}
            >
              Log out
            </button>
          </nav>
        ) : null}
      </header>
      <Outlet />
    </main>
  );
}
