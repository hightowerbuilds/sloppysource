import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Outlet } from "@tanstack/react-router";
import { supabase } from "../lib/supabase.ts";
import { AuthUserContext } from "../lib/authUserContext.ts";
import { Navbar } from "./Navbar.tsx";
import "../App.css";

export function RootLayout() {
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

  return (
    <main className="app-shell">
      <AuthUserContext.Provider value={user}>
        <Navbar user={user} />
        <Outlet />
      </AuthUserContext.Provider>
    </main>
  );
}
