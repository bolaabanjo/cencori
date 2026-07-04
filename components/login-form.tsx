"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import { resolveAuthRedirectTargets } from "@/lib/auth-redirect";
import { clearSignupWelcomeEmailPending, markSignupWelcomeEmailPending } from "@/lib/auth-welcome";
import Link from "next/link";

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const msg = err.message.toLowerCase();
  return msg === "failed to fetch" || msg.includes("networkerror") || msg.includes("network error") || msg.includes("load failed");
}

function friendlyError(err: unknown): string {
  if (isNetworkError(err)) {
    return "Unable to reach the authentication service. Check your internet connection, disable ad-blockers for this site, or try again.";
  }
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

type LoginFormProps = React.ComponentProps<"form">;

export function LoginForm({ className, ...props }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoInfo, setSsoInfo] = useState<{ sso: boolean; enforce?: boolean; organization?: string; domain?: string } | null>(null);
  const [checkingSSO, setCheckingSSO] = useState(false);

  const checkSSO = async (email: string) => {
    const domain = email.split("@")[1];
    if (!domain || domain.length < 3) {
      setSsoInfo(null);
      return;
    }
    setCheckingSSO(true);
    try {
      const res = await fetch("/api/auth/sso/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setSsoInfo(data);
    } catch {
      setSsoInfo(null);
    }
    setCheckingSSO(false);
  };

  const handleSSOLogin = async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      const domain = email.split("@")[1];
      const { error: ssoError } = await supabase.auth.signInWithSSO({ domain });
      if (ssoError) {
        setError(ssoError.message);
        setLoading(false);
      }
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
    }
  };

  const navigateAfterAuth = (target: string) => {
    if (/^https?:\/\//i.test(target)) {
      window.location.assign(target);
      return;
    }
    router.push(target);
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();

    if (!email) {
      setError("Please provide a valid email.");
      setLoading(false);
      return;
    }

    if (ssoInfo?.sso && ssoInfo.enforce) {
      await handleSSOLogin(email);
      return;
    }

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      const { navigationTarget } = resolveAuthRedirectTargets(redirectParam, {
        defaultPath: "/dashboard/organizations",
      });
      if (data?.session) {
        navigateAfterAuth(navigationTarget);
        return;
      }

      navigateAfterAuth(navigationTarget);
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }
  async function handleOAuth(provider: "github" | "google") {
    setError(null);
    setLoading(true);
    try {
      const { oauthRedirectTo } = resolveAuthRedirectTargets(redirectParam, {
        defaultPath: "/dashboard/organizations",
      });

      markSignupWelcomeEmailPending();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: oauthRedirectTo },
      });
      if (oauthError) {
        clearSignupWelcomeEmailPending();
        setError(oauthError.message);
        setLoading(false);
      }
    } catch (err) {
      clearSignupWelcomeEmailPending();
      setError(friendlyError(err));
      setLoading(false);
    }
  }

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={handleSubmit} {...props}>
      <div>
        <h1 className="text-lg font-medium">Login</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email below to login to your account
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="bola@example.com"
            required
            onBlur={(e) => checkSSO(e.target.value)}
          />
        </div>

        {ssoInfo?.sso && (
          <div className="text-sm">
            <p className="text-muted-foreground">
              SSO is {ssoInfo.enforce ? "required" : "available"} for {ssoInfo.organization}.
            </p>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="mt-1.5"
              onClick={() => {
                const emailInput = document.getElementById("email") as HTMLInputElement;
                if (emailInput?.value) handleSSOLogin(emailInput.value);
              }}
              disabled={loading}
            >
              {loading ? "Redirecting..." : `Log in with ${ssoInfo.organization} SSO`}
            </Button>
          </div>
        )}

        {(!ssoInfo?.enforce) && (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <a
                  href="/forgot"
                  className="text-sm text-primary underline underline-offset-4"
                >
                  Forgot your password?
                </a>
              </div>
              <Input id="password" name="password" type="password" />
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? "Working\u2026" : "Login"}
            </Button>
          </>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-2 text-xs text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => void handleOAuth("github")}
            disabled={loading}
            className="justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="shrink-0">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            GitHub
          </Button>

          <Button
            variant="outline"
            type="button"
            onClick={() => void handleOAuth("google")}
            disabled={loading}
            className="justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 48 48" className="shrink-0">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.29 1.46 8.18 2.69l6-5.84C34.28 3.64 29.52 2 24 2 14.64 2 6.61 7.86 3.24 15.81l7.36 5.72C12.23 14.55 17.56 9.5 24 9.5z" />
              <path fill="#34A853" d="M46.14 24.5c0-1.62-.15-3.18-.42-4.69H24v9.01h12.55a10.78 10.78 0 0 1-4.68 7.09l7.36 5.7C43.62 37.1 46.14 31.3 46.14 24.5z" />
              <path fill="#4A90E2" d="M10.6 28.49a14.32 14.32 0 0 1 0-8.98l-7.36-5.7A23.94 23.94 0 0 0 0 24c0 3.9.94 7.58 2.6 10.89l7.36-5.7z" />
              <path fill="#FBBC05" d="M24 46c5.52 0 10.16-1.82 13.55-4.94l-7.36-5.7C28.1 36.3 26.13 37 24 37a13.46 13.46 0 0 1-12.4-8.51l-7.36 5.7C6.61 40.14 14.64 46 24 46z" />
            </svg>
            Google
          </Button>

          <p className="mt-1 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href={redirectParam ? `/signup?redirect=${encodeURIComponent(redirectParam)}` : "/signup"}
              className="text-primary underline underline-offset-4"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </form>
  );
}
