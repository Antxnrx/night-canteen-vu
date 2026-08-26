import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "danger" | "accent" | "primary";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  accent: "bg-accent/15 text-accent",
  primary: "bg-primary/10 text-primary",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-current opacity-80"
        />
      )}
      {children}
    </span>
  );
}
