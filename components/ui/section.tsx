// components/ui/section.tsx
import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface SectionProps extends HTMLAttributes<HTMLElement> {}

export function Section({ className, children, ...props }: SectionProps) {
  return (
    <section className={cn("py-12 md:py-24 lg:py-32", className)} {...props}>
      {children}
    </section>
  );
}
