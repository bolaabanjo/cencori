import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

type Neighbour =
  | { name: React.ReactNode; url: string; description?: React.ReactNode }
  | undefined;

export function ElineDocsPrevNext({
  previous,
  next,
}: {
  previous: Neighbour;
  next: Neighbour;
}) {
  if (!previous && !next) return null;

  return (
    <div className="mt-16 grid grid-cols-2 gap-4 border-t border-border/30 pt-6">
      <div>
        {previous && (
          <Link
            href={previous.url}
            className="group flex flex-col gap-1 rounded-lg border border-border/30 p-3 transition-colors hover:border-[#a855f7]/40"
          >
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
              <ArrowLeft className="size-3" /> Previous
            </span>
            <span className="text-sm text-foreground group-hover:text-[#a855f7]">
              {previous.name}
            </span>
          </Link>
        )}
      </div>
      <div>
        {next && (
          <Link
            href={next.url}
            className="group flex flex-col items-end gap-1 rounded-lg border border-border/30 p-3 text-right transition-colors hover:border-[#a855f7]/40"
          >
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
              Next <ArrowRight className="size-3" />
            </span>
            <span className="text-sm text-foreground group-hover:text-[#a855f7]">
              {next.name}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
