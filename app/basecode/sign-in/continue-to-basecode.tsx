"use client";

import { useState } from "react";

type ContinueToBasecodeProps = {
  challenge: string;
  redirectUri: string;
  state: string;
};

type AuthorizeResponse = {
  callback_url?: string;
  error?: string;
  login_url?: string;
};

export function ContinueToBasecode({ challenge, redirectUri, state }: ContinueToBasecodeProps) {
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function continueToBasecode() {
    if (callbackUrl) {
      window.location.assign(callbackUrl);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/basecode/auth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code_challenge: challenge, redirect_uri: redirectUri, state }),
      });
      const result = (await response.json()) as AuthorizeResponse;

      if (response.status === 401 && result.login_url) {
        window.location.assign(result.login_url);
        return;
      }
      if (!response.ok || !result.callback_url) {
        throw new Error(result.error || "Cencori could not open Basecode.");
      }

      setCallbackUrl(result.callback_url);
      window.location.assign(result.callback_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cencori could not open Basecode.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className="h-12 w-full rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-65"
        disabled={loading}
        onClick={continueToBasecode}
        type="button"
      >
        {loading ? "Getting Basecode ready…" : callbackUrl ? "Open Basecode" : "Continue to Basecode"}
      </button>

      {callbackUrl ? (
        <p className="mt-4 text-xs leading-5 text-muted-foreground" role="status">
          Basecode didn&apos;t open? Click <span className="text-foreground">Open Basecode</span>{" "}
          again.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
