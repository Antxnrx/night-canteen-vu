"use client";

import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <div className="max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          A hiccup on our end. Please try again in a moment.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className={buttonClasses({ variant: "secondary" })}
          >
            Home
          </button>
        </div>
      </div>
    </main>
  );
}
