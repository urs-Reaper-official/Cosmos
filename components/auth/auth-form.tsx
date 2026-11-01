"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signInAction, signUpAction, type AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = {};

export function AuthForm({ confirmationError }: { confirmationError: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signInAction : signUpAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Link className="sidebar-brand" href="/">
          <span className="brand-mark">C</span>
          <span className="brand-copy">
            <strong>COSMOS</strong>
            <small>SUPER INTELLIGENCE</small>
          </span>
        </Link>
        <div className="auth-copy">
          <p>COSMOS · SUPER INTELLIGENCE</p>
          <h1>
            A clearer way
            <br />
            <em>forward.</em>
          </h1>
          <span>Your conversations and saved memories stay scoped to your workspace.</span>
        </div>
        <div className="auth-footer">COSMOS · A considered space to think</div>
      </aside>
      <section className="auth-main">
        <div className="auth-card">
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="auth-subtitle">
            {mode === "signin"
              ? "Sign in to continue your work."
              : "Start a private workspace for your conversations."}
          </p>
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button
              type="button"
              className={mode === "signin" ? "active" : ""}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          </div>
          <form action={formAction}>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              className="text-field"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              className="text-field"
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              maxLength={72}
            />
            {confirmationError && (
              <p className="auth-message error" role="alert">
                That confirmation link could not be used. Sign in or request a new confirmation
                email.
              </p>
            )}
            {state.error && (
              <p className="auth-message error" role="alert">
                {state.error}
              </p>
            )}
            {state.message && (
              <p className="auth-message" role="status">
                {state.message}
              </p>
            )}
            <button className="auth-submit" type="submit" disabled={pending}>
              {pending ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="privacy-note">
            SI requests are routed through the configured model provider. Never share passwords or
            secret keys in chat.
          </p>
        </div>
      </section>
    </main>
  );
}
