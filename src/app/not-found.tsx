import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-primary-deep px-6 py-16 text-center text-on-primary">
      <div className="max-w-sm">
        <svg viewBox="0 0 24 24" className="mx-auto mb-6 size-9 text-accent" fill="currentColor" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
        <h1 className="text-balance font-display text-3xl font-semibold tracking-tight">
          Nothing here
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-pretty text-on-primary/75">
          This page or order couldn&rsquo;t be found. It may have moved, or
          you&rsquo;re on a different device than the one that placed it.
        </p>
        <Link href="/" className={cn(buttonClasses({ variant: "accent" }), "mt-6")}>
          Back to the menu
        </Link>
      </div>
    </main>
  );
}
