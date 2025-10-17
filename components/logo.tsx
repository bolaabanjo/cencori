// components/Logo.tsx
// Server component — no "use client"
export function Logo({ variant = "full", className = "" }: { variant?: "mark" | "full"; className?: string }) {
    return (
      <div className={`inline-flex items-center ${className}`}>
        {/* light-mode image (visible when NOT dark) */}
        <img src="/clight.png" alt="Cencori logo" className="h-8 w-auto block dark:hidden" />
  
        {/* dark-mode image (visible when dark) */}
        <img src="/cdark.png" alt="Cencori logo" className="h-8 w-auto hidden dark:block" />
  
        {variant === "full" && (
          <span className="ml-3 text-lg font-medium text-slate-900 dark:text-white">Cencori</span>
        )}
      </div>
    );
  }
  