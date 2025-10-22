"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type SignupFormProps = React.ComponentProps<"form">;

export function SignupForm({ className, ...props }: SignupFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const form = e.currentTarget;
      const fd = new FormData(form);
      const email = String(fd.get("email") ?? "").trim();
      const password = String(fd.get("password") ?? "");
      const confirm = String(fd.get("confirm-password") ?? "");

      if (!email) {
        setError("Please enter a valid email.");
        setLoading(false);
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        setLoading(false);
        return;
      }

      if (password !== confirm) {
        setError("Passwords do not match.");
        setLoading(false);
        return;
      }

      // Decide redirect after sign up
      const redirectTo =
        `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/auth/callback`;

      // Create user with password
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      router.push("/onboarding");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "github" | "google") {
    setError(null);
    setLoading(true);
    try {
      const redirectTo =
        `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/onboarding`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
      // Supabase handles the redirect; we don't navigate here.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OAuth failed";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Enter your details below to get started
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded p-2 text-sm text-red-700 bg-red-50">
            {error}
          </div>
        )}

        {success && (
          <div role="status" className="rounded p-2 text-sm text-green-700 bg-green-50">
            {success}
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" placeholder="bola@example.com" required />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
          <Input
            id="confirm-password"
            name="confirm-password"
            type="password"
            required
            autoComplete="new-password"
          />
        </Field>

        <Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create Account"}
          </Button>
        </Field>

        <FieldSeparator>Or continue with</FieldSeparator>

        <Field className="flex flex-col gap-3">
            <Button
              variant="outline"
              type="button"
              onClick={() => void handleOAuth("github")}
              disabled={loading}
            >
              <svg className="mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                <path
                  d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                  fill="currentColor"
                />
              </svg>
              GitHub
            </Button>

            <Button
              variant="outline"
              type="button"
              onClick={() => void handleOAuth("google")}
              disabled={loading}
            >
              <svg className="mr-2" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.29 1.46 8.18 2.69l6-5.84C34.28 3.64 29.52 2 24 2 14.64 2 6.61 7.86 3.24 15.81l7.36 5.72C12.23 14.55 17.56 9.5 24 9.5z"/>
                <path fill="#34A853" d="M46.14 24.5c0-1.62-.15-3.18-.42-4.69H24v9.01h12.55a10.78 10.78 0 0 1-4.68 7.09l7.36 5.7C43.62 37.1 46.14 31.3 46.14 24.5z"/>
                <path fill="#4A90E2" d="M10.6 28.49a14.32 14.32 0 0 1 0-8.98l-7.36-5.7A23.94 23.94 0 0 0 0 24c0 3.9.94 7.58 2.6 10.89l7.36-5.7z"/>
                <path fill="#FBBC05" d="M24 46c5.52 0 10.16-1.82 13.55-4.94l-7.36-5.7C28.1 36.3 26.13 37 24 37a13.46 13.46 0 0 1-12.4-8.51l-7.36 5.7C6.61 40.14 14.64 46 24 46z"/>
              </svg>
              Google
            </Button>

          <FieldDescription className="text-center">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Log in
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
