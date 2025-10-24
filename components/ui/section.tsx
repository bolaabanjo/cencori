// components/ui/section.tsx
import { cn } from "@/lib/utils";
import React from "react"; // Import React for ComponentPropsWithoutRef

export function Section({ className, children, ...props }: React.ComponentPropsWithoutRef<'section'>) {
  return (
    <section className={cn("py-12 md:py-24 lg:py-32", className)} {...props}>
      {children}
    </section>
  );
}
