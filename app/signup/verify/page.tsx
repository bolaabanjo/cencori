"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { createBrowserClient } from "@supabase/ssr";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") ?? "";
  const userId = searchParams.get("userId") ?? "";

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) {
      setCanResend(true);
      return;
    }
    const interval = setInterval(() => {
      setResendTimer((t) => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d?$/.test(value)) return;

      const newDigits = [...digits];
      newDigits[index] = value;
      setDigits(newDigits);
      setError(null);

      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      if (value && index === 5) {
        const code = newDigits.join("");
        if (code.length === 6) {
          submitCode(code);
        }
      }
    },
    [digits]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newDigits = pasted.split("").concat(Array(6 - pasted.length).fill(""));
    setDigits(newDigits);
    setError(null);

    if (pasted.length === 6) {
      submitCode(pasted);
    } else {
      const nextIndex = Math.min(pasted.length, 5);
      inputRefs.current[nextIndex]?.focus();
    }
  }, []);

  const submitCode = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/verify/confirm-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, userId, origin: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        return;
      }
      setVerified(true);
      if (data.token && data.email) {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        );
        const { error: signInError } = await supabase.auth.verifyOtp({
          email: data.email,
          token: data.token,
          type: "magiclink",
        });
        if (signInError) {
          console.error("Auto-login failed:", signInError);
        }
      }
      router.push("/onboarding");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    setCanResend(false);
    setResendTimer(30);
    setSendingCode(true);
    try {
      await fetch("/api/verify/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // silently fail
    } finally {
      setSendingCode(false);
    }
  };

  if (verified) {
    return (
      <div className="h-dvh overflow-hidden flex flex-col items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-md flex flex-col items-center text-center gap-6">
          <div className="rounded-full bg-primary/10 p-5">
            <svg className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-medium">Email verified!</h1>
          <p className="text-base text-muted-foreground">Redirecting you to login\u2026</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden flex flex-col items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-md flex flex-col items-center text-center gap-8">

        <div className="space-y-2">
          <h1 className="text-xl font-medium">Check your email</h1>
          <p className="text-base text-muted-foreground">
            We sent a 6-digit code to{" "}
            <span className="text-foreground font-medium">{email}</span>
          </p>
        </div>

        <div className="flex gap-3" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={loading}
              className="w-14 h-16 text-center text-2xl font-semibold rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          ))}
        </div>

        {error && <p className="text-base text-destructive">{error}</p>}

        <button
          type="button"
          onClick={() => submitCode(digits.join(""))}
          disabled={loading || digits.some((d) => !d)}
          className="h-8 px-4 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-all disabled:opacity-40"
        >
          {loading ? <HugeiconsIcon icon={Loading03Icon} className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Verify"}
        </button>

        <div className="text-base text-muted-foreground space-y-1">
          {sendingCode ? (
            <p className="flex items-center justify-center gap-1">
              <HugeiconsIcon icon={Loading03Icon} className="h-4 w-4 animate-spin" /> Sending\u2026
            </p>
          ) : canResend ? (
            <button
              type="button"
              onClick={handleResend}
              className="text-primary underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Resend code
            </button>
          ) : (
            <p>
              Resend code in <span className="tabular-nums">{resendTimer}s</span>
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Wrong email?{" "}
          <Link href="/signup" className="text-primary underline underline-offset-2 hover:text-foreground">
            Go back
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="h-dvh flex items-center justify-center">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
