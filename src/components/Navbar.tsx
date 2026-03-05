import type { User } from "@supabase/supabase-js";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase.ts";
import { getUserStorageUsage } from "../lib/supabaseDb.ts";
import { storageUsageQueryKey } from "../lib/queryKeys.ts";
import { useSelectedDoc } from "../lib/useSelectedDoc.ts";
import { formatBytes } from "../lib/format.ts";
import "./Navbar.css";

interface NavbarProps {
  user: User | null;
}

export function Navbar({ user }: NavbarProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setDocId } = useSelectedDoc();
  const userId = user?.id ?? null;

  const storageQuery = useQuery({
    queryKey: storageUsageQueryKey(userId),
    queryFn: getUserStorageUsage,
    staleTime: 30_000,
    enabled: !!userId,
  });

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Failed to log out:", error);
      return;
    }
    setDocId(null);
    queryClient.clear();
    await navigate({ to: "/login" });
  }

  const username = user?.user_metadata?.username as string | undefined;
  const storage = storageQuery.data;
  const usageRatio = storage ? storage.usedBytes / storage.limitBytes : 0;

  return (
    <div className="header-row">
      <header className="navbar">
        <div className="nav-left">
          <p className="brand">sloppysource.dev</p>
          {user ? (
            <>
              <Link to="/" className="nav-button" activeOptions={{ exact: true }}>
                Home
              </Link>
              <Link to="/upload" className="nav-button" activeOptions={{ exact: true }}>
                Upload
              </Link>
              <Link
                to="/project"
                className="nav-button"
                activeOptions={{ exact: true }}
              >
                Project
              </Link>
              <Link
                to="/display"
                className="nav-button"
                activeOptions={{ exact: true }}
              >
                Display
              </Link>
              <Link
                to="/search"
                className="nav-button"
                activeOptions={{ exact: true }}
              >
                Search
              </Link>
            </>
          ) : null}
        </div>
      </header>
      {user && storage ? (
        <div className="navbar-storage">
          <span className="navbar-storage-label">
            {formatBytes(storage.usedBytes)} / {formatBytes(storage.limitBytes)}
          </span>
          <div className="navbar-quota-track">
            <div
              className={`navbar-quota-fill${
                usageRatio > 0.9
                  ? " is-danger"
                  : usageRatio > 0.7
                    ? " is-warning"
                    : ""
              }`}
              style={{ width: `${Math.min(100, usageRatio * 100)}%` }}
            />
          </div>
        </div>
      ) : null}
      {user ? (
        <div className="user-corner">
          <span className="nav-user">{username ?? "User"}</span>
          <button
            className="nav-button"
            type="button"
            onClick={() => void handleLogout()}
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
