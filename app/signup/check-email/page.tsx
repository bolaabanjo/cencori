"use client";

import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-4xl shadow p-8 text-center">
        <h2 className="text-2xl font-semibold mb-2">Check your email</h2>
        <p className="text-sm text-slate-600 mb-6">
          We sent a secure link to your inbox. Click the link to complete signup and return to the site.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="w-full inline-block py-2 rounded-full bg-black text-white text-center"
          >
            Back to Sign in
          </Link>

          <Link
            href="/"
            className="w-full inline-block py-2 rounded-full border text-center"
          >
            Return home
          </Link>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Don&apos;t see the email? Check your spam folder or try signing up again.
        </p>
      </div>
    </main>
  );
}
