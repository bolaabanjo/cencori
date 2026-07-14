"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-dvh overflow-hidden flex flex-col items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-8">
        <Link href="/">
          <Logo variant="mark" className="h-6" />
        </Link>

        {sent ? (
          <div className="space-y-2">
            <h1 className="text-lg font-medium">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for {email}, you&apos;ll receive a password reset link shortly.
            </p>
            <Link href="/login" className="block mt-4 text-sm text-primary underline underline-offset-4 hover:text-foreground transition-colors">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
            <div className="space-y-2">
              <h1 className="text-lg font-medium">Forgot password?</h1>
              <p className="text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="bola@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>

            <Link href="/login" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors">
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
