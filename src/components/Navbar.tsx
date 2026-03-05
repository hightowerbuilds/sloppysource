import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
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
  const location = useLocation();
  const queryClient = useQueryClient();
  const { setDocId } = useSelectedDoc();
  const userId = user?.id ?? null;
  const [isMdsOpen, setIsMdsOpen] = useState(false);
  const mdsDropdownRef = useRef<HTMLDivElement | null>(null);

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
  const isMdsActive =
    location.pathname === "/upload" ||
    location.pathname === "/display" ||
    location.pathname === "/search";

  useEffect(() => {
    if (!isMdsOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (!mdsDropdownRef.current?.contains(event.target as Node)) {
        setIsMdsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMdsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMdsOpen]);

  function handleMdsItemClick() {
    setIsMdsOpen(false);
  }

  return (
    <div className="header-row">
      <header className="navbar">
        <div className="nav-left">
          <p className="brand">sloppysource.dev</p>
          {user ? (
            <>
              <Link
                to="/"
                className="nav-button"
                activeOptions={{ exact: true }}
                onClick={handleMdsItemClick}
              >
                Home
              </Link>
              <Link
                to="/project"
                className="nav-button"
                activeOptions={{ exact: true }}
                onClick={handleMdsItemClick}
              >
                Projects
              </Link>
              <div className="nav-dropdown" ref={mdsDropdownRef}>
                <button
                  type="button"
                  className={`nav-button${isMdsActive ? " is-active" : ""}`}
                  onClick={() => setIsMdsOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isMdsOpen}
                >
                  MDs
                </button>
                {isMdsOpen ? (
                  <div className="nav-dropdown-menu" role="menu" aria-label="MDs navigation">
                    <Link
                      to="/upload"
                      className="nav-dropdown-item"
                      activeOptions={{ exact: true }}
                      role="menuitem"
                      onClick={handleMdsItemClick}
                    >
                      /upload
                    </Link>
                    <Link
                      to="/display"
                      className="nav-dropdown-item"
                      activeOptions={{ exact: true }}
                      role="menuitem"
                      onClick={handleMdsItemClick}
                    >
                      /display
                    </Link>
                    <Link
                      to="/search"
                      className="nav-dropdown-item"
                      activeOptions={{ exact: true }}
                      role="menuitem"
                      onClick={handleMdsItemClick}
                    >
                      /search
                    </Link>
                  </div>
                ) : null}
              </div>
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
