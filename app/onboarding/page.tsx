"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { slugify } from "@/lib/utils";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";

const PLANS = [
  {
    id: "free",
    name: "Free",
    description: "For personal projects",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For teams and businesses",
    popular: true,
  },
] as const;

function getRequestLimit(tier: string): number {
  switch (tier) {
    case "free": return 1000;
    case "pro": return 50000;
    default: return 1000;
  }
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center bg-black"><HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-zinc-400" /></div>}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "true";
  const [orgName, setOrgName] = useState("");
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
  );

  useEffect(() => {
    if (preview) {
      setCheckingAuth(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setCheckingAuth(false);
    });
  }, [supabase, router, preview]);

  const handleSubmit = async () => {
    if (!orgName.trim()) {
      toast.error("Please enter an organization name.");
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in.");
      setLoading(false);
      return;
    }

    const baseSlug = slugify(orgName.trim()) || "org";
    let newSlug = baseSlug;
    let slugExists = true;
    for (let i = 0; i < 10; i++) {
      // Skip reserved slugs (would collide with app routes like /enterprise).
      if (isReservedSlug(newSlug)) {
        newSlug = `${baseSlug}-${i + 1}`;
        continue;
      }
      const { data } = await supabase
        .from("organizations")
        .select("slug")
        .eq("slug", newSlug)
        .single();
      if (!data) {
        slugExists = false;
        break;
      }
      newSlug = `${baseSlug}-${i + 1}`;
    }

    if (slugExists) {
      toast.error("Could not generate a unique slug. Try again.");
      setLoading(false);
      return;
    }

    const isPaid = plan === "pro";
    const initialTier = isPaid ? "free" : "free";

    const { data: orgData, error } = await supabase
      .from("organizations")
      .insert({
        name: orgName.trim(),
        slug: newSlug,
        subscription_tier: initialTier,
        subscription_status: "active",
        monthly_request_limit: getRequestLimit(initialTier),
        monthly_requests_used: 0,
        owner_id: user.id,
      })
      .select("id, slug")
      .single();

    if (error || !orgData) {
      console.error("Error creating organization:", error?.message);
      toast.error("Failed to create organization.");
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: orgData.id,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) {
      console.error("Error adding member:", memberError.message);
      await supabase.from("organizations").delete().eq("id", orgData.id);
      toast.error("Failed to finalize setup.");
      setLoading(false);
      return;
    }

    if (isPaid) {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "pro", interval: "month", orgId: orgData.id }),
      });
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        await supabase.from("organizations").delete().eq("id", orgData.id);
        toast.error("Checkout failed. Please try again.");
        setLoading(false);
      }
    } else {
      toast.success("Organization created!");
      router.push(`/${orgData.slug}`);
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black">
        <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-black p-4">
      <div className="w-full max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-white">Glad to have you!</h1>
          <p className="text-zinc-400 mt-1 text-sm">Set up your organization to get started</p>
        </div>

        <div className="rounded-xl bg-black p-6 space-y-6">
          <div>
            <label htmlFor="orgName" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Organization Name
            </label>
            <Input
              id="orgName"
              placeholder="e.g. Acme Corp"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="bg-zinc-900 text-white placeholder:text-zinc-500 h-10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Choose your plan
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlan(p.id)}
                  className={`relative rounded-lg p-4 text-left transition-all ${
                    plan === p.id
                      ? "bg-zinc-900 ring-1 ring-blue-500"
                      : "bg-zinc-900/50 hover:bg-zinc-900/80"
                  }`}
                >
                  {p.popular && (
                    <span className="absolute -top-2.5 right-3 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold text-black">
                      Popular
                    </span>
                  )}
                  <span className="text-sm font-medium text-white">{p.name}</span>
                  <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full h-10 bg-white text-black hover:bg-zinc-200 font-medium disabled:opacity-50"
          >
            {loading ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin mr-2" />
            ) : null}
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
