"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupCompletePage() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function finishSignup() {
      try {
        // Ensure user session is loaded
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user) {
          console.error("No user session found after magic link:", userError?.message);
          if (mounted) setStatus("error");
          return;
        }

        const user = userData.user;

        // Grab any stored name from the earlier signup flow
        const storedName = typeof window !== "undefined" ? localStorage.getItem("cencori_signup_name") ?? "" : "";

        if (storedName.trim().length > 0) {
          // Attempt to update the users table (mirror created by auth trigger)
          const { error: updateError } = await supabase
            .from("users")
            .update({ name: storedName.trim() })
            .eq("id", user.id);

          if (updateError) {
            console.error("Failed to update user profile:", updateError.message);
            // Not fatal — continue
          } else {
            // remove the stored name after success
            try {
              localStorage.removeItem("cencori_signup_name");
            } catch {
              /* ignore */
            }
          }
        }

        if (mounted) {
          setStatus("done");
          // small pause so user sees confirmation
          setTimeout(() => {
            router.push("/dashboard/organization");
          }, 700);
        }
      } catch (err) {
        console.error("Error finishing signup:", err);
        if (mounted) setStatus("error");
      }
    }

    finishSignup();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (status === "working") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">Signing you in…</h2>
          <p className="text-sm text-slate-600">
            Finalizing your account. You’ll be redirected to the dashboard shortly.
          </p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-600 mb-4">
            We couldn't complete sign-in automatically. Try signing in again.
          </p>

          <div className="flex gap-3 justify-center">
            <a href="/login" className="px-4 py-2 rounded border">
              Sign in
            </a>
            <a href="/" className="px-4 py-2 rounded bg-black text-white">
              Return home
            </a>
          </div>
        </div>
      </main>
    );
  }

  // status === "done" (will briefly show)
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
        <h2 className="text-lg font-semibold mb-2">Welcome aboard</h2>
        <p className="text-sm text-slate-600">Redirecting you to the dashboard…</p>
      </div>
    </main>
  );
}
