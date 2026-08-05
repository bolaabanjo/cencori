import { Suspense } from "react";
import { LoginForm } from "@/components/login-form"
import Link from "next/link"

function LoginPageContent() {
  return (
    <div className="min-h-dvh flex flex-col p-4 md:p-6">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <LoginForm />
        </div>
      </div>
      <div className="shrink-0 text-center pb-2">
        <p className="text-xs text-muted-foreground">
          By creating an account, you agree to our{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center">Loading...</div>}>
      <LoginPageContent />
    </Suspense>
  )
}
