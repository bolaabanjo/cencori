"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, Suspense, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { slugify } from "@/lib/utils";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { Logo } from "@/components/logo";

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

type ProvisionedOrganization = {
  id: string;
  slug: string;
  name: string;
};

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
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [provisionedOrganization, setProvisionedOrganization] =
    useState<ProvisionedOrganization | null>(null);
  const organizationPromiseRef = useRef<Promise<ProvisionedOrganization | null> | null>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const orgNameInputRef = useRef<HTMLInputElement>(null);

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
      const metadataName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        [user.user_metadata?.first_name, user.user_metadata?.last_name]
          .filter(Boolean)
          .join(" ");
      if (metadataName) {
        setFullName((currentName) => currentName || metadataName);
      }
      setCheckingAuth(false);
    });
  }, [router, preview]);

  const focusFullName = () => {
    requestAnimationFrame(() => fullNameInputRef.current?.focus());
  };

  const focusOrganizationName = () => {
    requestAnimationFrame(() => orgNameInputRef.current?.focus());
  };

  const ensureOrganization = async (): Promise<ProvisionedOrganization | null> => {
    if (provisionedOrganization) return provisionedOrganization;
    if (organizationPromiseRef.current) return organizationPromiseRef.current;

    if (!fullName.trim()) {
      toast.error("Please enter your full name.");
      focusFullName();
      return null;
    }

    if (!orgName.trim()) {
      toast.error("Please enter an organization name.");
      focusOrganizationName();
      return null;
    }

    const normalizedFullName = fullName.trim().replace(/\s+/g, " ");
    const organizationName = orgName.trim();
    const provisionOrganization = async (): Promise<ProvisionedOrganization | null> => {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error("You must be logged in.");
          return null;
        }

        const [firstName, ...remainingNameParts] = normalizedFullName.split(" ");
        const lastName = remainingNameParts.join(" ");
        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            full_name: normalizedFullName,
            name: normalizedFullName,
            first_name: firstName,
            last_name: lastName,
          },
        });

        if (metadataError) {
          console.error("Error saving user name:", metadataError.message);
          toast.error("Could not save your name. Please try again.");
          return null;
        }

        const profileResponse = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
          }),
        });

        if (!profileResponse.ok) {
          console.error("Error saving user profile:", await profileResponse.text());
          toast.error("Could not finish saving your profile. Please try again.");
          return null;
        }

        const baseSlug = slugify(organizationName) || "org";
        let newSlug = baseSlug;
        let slugExists = true;

        for (let i = 0; i < 10; i++) {
          // Skip reserved slugs that collide with application routes.
          if (isReservedSlug(newSlug)) {
            newSlug = `${baseSlug}-${i + 1}`;
            continue;
          }

          const { data, error: slugError } = await supabase
            .from("organizations")
            .select("slug")
            .eq("slug", newSlug)
            .maybeSingle();

          if (slugError) {
            console.error("Error checking organization slug:", slugError.message);
            toast.error("Could not prepare your organization. Please try again.");
            return null;
          }

          if (!data) {
            slugExists = false;
            break;
          }
          newSlug = `${baseSlug}-${i + 1}`;
        }

        if (slugExists) {
          toast.error("Could not generate a unique slug. Try again.");
          return null;
        }

        // Paid onboarding starts as Free and is upgraded only after Stripe confirms payment.
        const initialTier = "free";
        const { data: orgData, error } = await supabase
          .from("organizations")
          .insert({
            name: organizationName,
            slug: newSlug,
            subscription_tier: initialTier,
            subscription_status: "active",
            monthly_requests_used: 0,
            owner_id: user.id,
          })
          .select("id, slug, name")
          .single();

        if (error || !orgData) {
          console.error("Error creating organization:", error?.message);
          toast.error("Failed to create organization.");
          return null;
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
          return null;
        }

        const organization = {
          id: orgData.id,
          slug: orgData.slug,
          name: orgData.name || organizationName,
        };
        setProvisionedOrganization(organization);
        return organization;
      } finally {
        setLoading(false);
      }
    };

    const provisionPromise = provisionOrganization();
    organizationPromiseRef.current = provisionPromise;

    try {
      return await provisionPromise;
    } finally {
      organizationPromiseRef.current = null;
    }
  };

  const handlePlanSelect = (selectedPlan: "free" | "pro") => {
    if (loading) return;
    setPlan(selectedPlan);
  };

  const handleSubmit = async () => {
    const organization = await ensureOrganization();
    if (!organization) return;

    if (plan === "pro") {
      setCheckoutOpen(true);
    } else {
      toast.success("Organization created!");
      router.push(`/${organization.slug}`);
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
          <Logo variant="mark" className="h-6 mx-auto mb-5" />
          <h1 className="text-2xl font-semibold text-white">Glad to have you!</h1>
          <p className="text-zinc-400 mt-1 text-sm">Set up your organization to get started</p>
        </div>

        <div className="rounded-xl bg-black p-6 space-y-6">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Full name
            </label>
            <Input
              ref={fullNameInputRef}
              id="fullName"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Ada Lovelace"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading || Boolean(provisionedOrganization)}
              required
              className="h-10 border-white/10 bg-zinc-900 text-white placeholder:text-zinc-500 transition-colors hover:border-white/[0.16] focus-visible:border-white/25 focus-visible:ring-white/[0.06]"
            />
          </div>

          <div>
            <label htmlFor="orgName" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Organization Name
            </label>
            <Input
              ref={orgNameInputRef}
              id="orgName"
              placeholder="e.g. Acme Corp"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={loading || Boolean(provisionedOrganization)}
              className="h-10 border-white/10 bg-zinc-900 text-white placeholder:text-zinc-500 transition-colors hover:border-white/[0.16] focus-visible:border-white/25 focus-visible:ring-white/[0.06]"
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
                  onClick={() => handlePlanSelect(p.id)}
                  disabled={loading}
                  aria-pressed={plan === p.id}
                  className={`relative rounded-lg border p-4 text-left transition-colors ${
                    plan === p.id
                      ? "border-blue-500/45 bg-zinc-900"
                      : "border-white/[0.06] bg-zinc-900/50 hover:border-white/10 hover:bg-zinc-900/80"
                  } disabled:cursor-wait disabled:opacity-60`}
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
          <p className="text-xs text-muted-foreground text-center mt-4">
            By continuing, you agree to the{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-zinc-400 transition-colors">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-zinc-400 transition-colors">
              Privacy Policy
            </Link>.
          </p>
        </div>
      </div>

      {provisionedOrganization && (
        <UpgradeDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          orgId={provisionedOrganization.id}
          orgSlug={provisionedOrganization.slug}
          orgName={provisionedOrganization.name}
          currentTier="free"
          recommendedTier="pro"
          checkoutMode="direct"
        />
      )}
    </div>
  );
}
