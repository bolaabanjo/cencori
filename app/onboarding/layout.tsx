// app/onboarding/layout.tsx (example)
import { ThemeToggle } from "@/components/theme-toggle";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-4">
        {/* left: brand */}
        <div className="flex items-center gap-3">...</div>

        {/* right: theme toggle */}
        <div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
