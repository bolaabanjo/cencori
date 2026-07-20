"use client";

import { useTheme } from "next-themes";
import { Toaster as SileoToaster } from "sileo";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SileoToaster
      position="bottom-center"
      offset={{ bottom: 16 }}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      options={{
        duration: 5000,
        roundness: 16,
        autopilot: false,
        styles: {
          title: "font-sans! text-[13px]! font-medium! normal-case! tracking-[-0.01em]!",
          description: "font-sans! text-[13px]! leading-5!",
          button: "font-sans!",
        },
      }}
    />
  );
}
