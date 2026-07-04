"use client";

import { Check, Loader2 } from "lucide-react";
import { FormEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SubmissionState = "idle" | "success" | "error";

interface NewsletterSignupFormProps {
  source?: string;
  className?: string;
}

export function NewsletterSignupForm({
  source = "newsletter-page",
  className,
}: NewsletterSignupFormProps) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmissionState("idle");
    setMessage(null);

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          source,
          website,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        alreadySubscribed?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not subscribe right now.");
      }

      setSubmissionState("success");
      setMessage(
        data.alreadySubscribed
          ? "You're already on the list."
          : "You're in. Watch for the welcome email."
      );
      setEmail("");
      setWebsite("");
    } catch (error) {
      setSubmissionState("error");
      setMessage(
        error instanceof Error ? error.message : "Could not subscribe right now."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("w-full", className)}>
      <input
        type="text"
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0 pointer-events-none"
      />

      <label htmlFor={emailId} className="text-sm font-medium">
        Email address
      </label>

      <div className="mt-2 flex items-center gap-2">
        <Input
          id={emailId}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          disabled={isSubmitting}
          className="flex-1"
        />

        <Button type="submit" disabled={isSubmitting || !email.trim()}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending
            </>
          ) : (
            "Subscribe"
          )}
        </Button>
      </div>

      {message ? (
        <p
          aria-live="polite"
          className={cn(
            "mt-2 flex items-center gap-2 text-sm",
            submissionState === "success"
              ? "text-foreground"
              : "text-destructive"
          )}
        >
          {submissionState === "success" ? <Check className="h-4 w-4" /> : null}
          <span>{message}</span>
        </p>
      ) : null}
    </form>
  );
}
