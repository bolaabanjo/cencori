"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();

  const handleClick = () => {
    if (window.history.length > 1 || document.referrer) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium text-background bg-foreground rounded-md hover:opacity-90 transition-opacity"
    >
      Go back
    </button>
  );
}
