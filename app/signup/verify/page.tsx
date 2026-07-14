"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, CheckmarkBadge01Icon } from "@hugeicons/core-free-icons";
import { createBrowserClient } from "@supabase/ssr";
import { Logo } from "@/components/logo";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") ?? "";
  const userId = searchParams.get("userId") ?? "";
  const preview = searchParams.get("preview") === "true";

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [shaking, setShaking] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (error) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 400);
      return () => clearTimeout(timer);
    }
  }, [error]);

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

  const fireConfetti = useCallback(() => {
    const colors = ["#10b981", "#34d399", "#fbbf24", "#f59e0b", "#fff"];
    for (let i = 0; i < 80; i++) {
      const el = document.createElement("div");
      el.style.cssText = `
        position:fixed;width:8px;height:8px;border-radius:2px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        left:${Math.random() * 100}vw;top:-10px;
        z-index:9999;pointer-events:none;
      `;
      document.body.appendChild(el);
      const tx = (Math.random() - 0.5) * 200;
      const ty = 400 + Math.random() * 600;
      el.animate([
        { transform: "translateY(0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ], { duration: 1500 + Math.random() * 1000, easing: "cubic-bezier(.25,.46,.45,.94)", fill: "forwards" })
        .onfinish = () => el.remove();
    }
  }, []);

  useEffect(() => {
    if (verified || preview) {
      fireConfetti();
    }
  }, [verified, preview, fireConfetti]);

  if (verified || preview) {
    return (
      <div className="h-dvh overflow-hidden flex flex-col items-center justify-center p-4 md:p-6" onClick={fireConfetti}>
        <div className="w-full max-w-md flex flex-col items-center text-center">
          <div className="flex flex-col items-center gap-6">
            <div className="rounded-full bg-primary/10 p-5">
              <HugeiconsIcon icon={CheckmarkBadge01Icon} className="h-10 w-10 text-emerald-500" />
            </div>
            <h1 className="text-xl font-medium">Your email has been verified</h1>
          </div>
          <div className="text-base text-muted-foreground mt-8">
            <p>Moving you to your workspace…</p>
            <p className="mt-1.5 text-xs text-muted-foreground/60">
              By continuing, you agree to our{" "}
              <Link href="/legal/terms" className="underline hover:text-foreground transition-colors">Terms</Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>.
              <br />
              &copy; {new Date().getFullYear()} Cencori Inc. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .shake { animation: shake 0.3s ease-in-out; }
      `}</style>
      <div className="h-dvh overflow-hidden flex flex-col items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-md flex flex-col items-center text-center gap-8">
        <Logo variant="mark" className="h-6" />
        <div className="space-y-2">
          <h1 className="text-xl font-medium">Check your email</h1>
          <p className="text-base text-muted-foreground">
            We sent a 6-digit code to{" "}
            <span className="text-foreground font-medium">{email}</span>
          </p>
        </div>

        <div className={`flex ${shaking ? 'shake' : ''}`} onPaste={handlePaste}>
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
              className={`w-14 h-16 text-center text-2xl font-semibold border bg-background focus:outline-none focus:ring-1 focus:ring-[#555] focus:z-10 disabled:opacity-50 transition-colors duration-75 ${shaking ? 'border-destructive' : 'border-input'} ${i === 0 ? 'rounded-l-xl' : '-ml-px'} ${i === 5 ? 'rounded-r-xl' : ''}`}
            />
          ))}
        </div>

        <div className="text-base text-muted-foreground space-y-1">
          {sendingCode ? (
            <p className="flex items-center justify-center gap-1">
              <HugeiconsIcon icon={Loading03Icon} className="h-4 w-4 animate-spin" /> Sending…
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

        <div className="text-sm text-muted-foreground">
          <p>
            Wrong email?{" "}
            <Link href="/signup" className="text-primary underline underline-offset-2 hover:text-foreground">
              Go back
            </Link>
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground/60">
            By continuing, you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-foreground transition-colors">Terms</Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>.
            <br />
            &copy; {new Date().getFullYear()} Cencori Inc. All rights reserved.
          </p>
        </div>
      </div>
      </div>
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="h-dvh flex items-center justify-center">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
