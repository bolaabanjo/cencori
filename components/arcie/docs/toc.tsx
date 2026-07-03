"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type TocItem = { title: React.ReactNode; url: string; depth: number };

// Highlight the heading currently in view (same approach as the main docs TOC).
function useActiveAnchor(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "0% 0% -70% 0%" },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

export function ArcieDocsToc({ toc }: { toc: TocItem[] }) {
  const ids = useMemo(() => toc.map((t) => t.url.replace("#", "")), [toc]);
  const active = useActiveAnchor(ids);

  if (!toc.length) return null;

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
        On this page
      </p>
      <div className="flex flex-col gap-1.5">
        {toc.map((item) => (
          <a
            key={item.url}
            href={item.url}
            className={cn(
              "text-muted-foreground/80 transition-colors hover:text-foreground",
              `#${active}` === item.url && "text-[#a855f7]",
              item.depth >= 3 && "pl-3",
            )}
          >
            {item.title}
          </a>
        ))}
      </div>
    </div>
  );
}
