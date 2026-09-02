import type { Metadata } from "next";
import Link from "next/link";

import { AuthNavbar } from "@/components/landing/AuthNavbar";
import { Footer } from "@/components/landing/Footer";
import { NewsletterSignupForm } from "@/components/newsletter/NewsletterSignupForm";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Newsletter",
  description:
    "Subscribe to the Cencori newsletter for product updates, security research, and notes from the team.",
  alternates: {
    canonical: "/newsletter",
  },
  openGraph: {
    title: "Cencori Newsletter",
    description:
      "Product updates, security research, and notes from the team building the control plane for production AI.",
    url: "https://cencori.com/newsletter",
  },
  twitter: {
    title: "Cencori Newsletter",
    description:
      "Product updates, security research, and notes from the team building the control plane for production AI.",
  },
};

export const revalidate = 3600;

/**
 * How long the build will wait for the subscriber count before giving up on it.
 *
 * This page is prerendered, so this query runs on the build machine. It had no bound, and when the
 * database was unreachable from there the request hung until Next's own 60s page limit killed it —
 * three times, and then the whole deployment failed on a decorative number. The page already
 * renders perfectly well without a count; it just never got the chance to.
 */
const SUBSCRIBER_COUNT_TIMEOUT_MS = 5_000;

async function getConfirmedSubscriberCount() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  try {
    const { createAdminClient } = await import("@/lib/supabaseAdmin");
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed")
      .abortSignal(AbortSignal.timeout(SUBSCRIBER_COUNT_TIMEOUT_MS));

    if (error) {
      console.error("[NewsletterPage] Failed to load subscriber count:", error);
      return null;
    }

    return count ?? 0;
  } catch (error) {
    console.error("[NewsletterPage] Failed to initialize subscriber count:", error);
    return null;
  }
}

function getSubscriberLabel(count: number | null) {
  if (typeof count !== "number" || count < 25) {
    return "A few emails a month. Never filler.";
  }

  return `Join ${new Intl.NumberFormat("en-US").format(count)} subscribers`;
}

export default async function NewsletterPage() {
  const confirmedSubscriberCount = await getConfirmedSubscriberCount();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AuthNavbar />

      <main className="pt-20">
        <section className="py-24 md:py-32">
          <div className="mx-auto max-w-lg px-4 md:px-6">
            <h1 className="text-2xl font-medium md:text-3xl">
              The Builder&apos;s Log.
            </h1>

            <p className="mt-3 text-sm text-muted-foreground md:text-base">
              Product updates, security research, and notes from the team
              building the infrastructure for AI.
            </p>

            <p className="mt-4 text-xs text-muted-foreground">
              {getSubscriberLabel(confirmedSubscriberCount)}
            </p>

            <div className="mt-8">
              <NewsletterSignupForm />
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              By subscribing, you agree to our{" "}
              <Link
                href="/terms-of-service"
                className="text-primary underline underline-offset-4"
              >
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy-policy"
                className="text-primary underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              . Unsubscribe in one click any time.
            </p>

            <div className="mt-8 flex flex-row items-center gap-3">
              <Link
                href={siteConfig.links.company.blog}
                className="text-sm text-primary underline underline-offset-4"
              >
                Read the blog
              </Link>
              <span className="text-muted-foreground">/</span>
              <Link
                href={siteConfig.links.docs}
                className="text-sm text-primary underline underline-offset-4"
              >
                Explore docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
