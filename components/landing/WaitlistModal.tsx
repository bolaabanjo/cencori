"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Loader2 } from "lucide-react";

interface WaitlistModalProps {
  productName: string;
  children: React.ReactNode;
}

export function WaitlistModal({ productName, children }: WaitlistModalProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, productName }),
      });

      if (!res.ok) {
        throw new Error("Failed to join waitlist");
      }

      setSubmitted(true);
      toast.success(`You're on the list for ${productName}!`);
      setTimeout(() => {
        setOpen(false);
      }, 2500);
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Reset state when modal opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setTimeout(() => {
        setSubmitted(false);
        setEmail("");
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-background border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading font-black text-foreground">Join the Waitlist</DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1.5">
            Get early access to Cencori <span className="text-foreground font-medium">{productName}</span>.
          </DialogDescription>
        </DialogHeader>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-2">
              <Input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted/50 border-border/50 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/50"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {loading ? "Joining..." : "Join Waitlist"}
            </Button>
          </form>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <span className="text-emerald-500 text-xl font-bold">✓</span>
            </div>
            <p className="text-sm font-medium text-foreground">You're on the list.</p>
            <p className="text-xs text-muted-foreground">We'll be in touch soon.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
