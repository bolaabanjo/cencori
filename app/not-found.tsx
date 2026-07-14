import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center text-center max-w-sm">
        <h1 className="text-8xl font-mono font-bold tracking-tighter text-foreground leading-none mb-4">
          404
        </h1>
        <p className="text-muted-foreground text-sm mb-8 max-w-xs">
          This page doesn&apos;t exist. It may have moved, or the link is incorrect.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium text-background bg-foreground rounded-md hover:opacity-90 transition-opacity"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  );
}
