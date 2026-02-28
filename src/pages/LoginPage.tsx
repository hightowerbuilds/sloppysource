import { useState } from "react";
import type { FormEvent } from "react";
import { createLazyRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "../lib/supabase.ts";
import "./LoginPage.css";

const EMAIL_DOMAIN = "sloppysource.local";

export const Route = createLazyRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function usernameToEmail(name: string): string {
    return `${name.toLowerCase().trim()}@${EMAIL_DOMAIN}`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setErrorMessage("Username is required.");
      setIsSubmitting(false);
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      setIsSubmitting(false);
      return;
    }

    const email = usernameToEmail(trimmedUsername);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: trimmedUsername },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }

      await navigate({ to: "/" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Authentication failed.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-panel">
      <p className="section-title">
        {mode === "login" ? "Log In" : "Sign Up"}
      </p>
      <form className="login-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="login-label" htmlFor="login-username">
          Username
        </label>
        <input
          className="login-input"
          id="login-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isSubmitting}
        />

        <label className="login-label" htmlFor="login-password">
          Password
        </label>
        <input
          className="login-input"
          id="login-password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
        />

        <button className="upload-button" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Please wait..."
            : mode === "login"
              ? "Log In"
              : "Create Account"}
        </button>

        {errorMessage ? (
          <p className="status error" role="status">
            {errorMessage}
          </p>
        ) : null}
      </form>

      <p className="hint">
        {mode === "login" ? (
          <>
            No account?{" "}
            <button
              className="mode-toggle"
              type="button"
              onClick={() => {
                setMode("signup");
                setErrorMessage(null);
              }}
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              className="mode-toggle"
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMessage(null);
              }}
            >
              Log in
            </button>
          </>
        )}
      </p>
    </section>
  );
}
