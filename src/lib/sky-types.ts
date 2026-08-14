/**
 * Sky types, kept apart from `sky.ts` so client components (the hero, the
 * weather canvas) can type their props without pulling in a `server-only`
 * module.
 */

export type SkyPhase = "morning" | "afternoon" | "golden" | "night";
export type SkyCondition = "clear" | "cloud" | "rain";

export type Sky = {
  phase: SkyPhase;
  condition: SkyCondition;
  /** Short human label — "Rainy afternoon". Never a clock reading. */
  label: string;
  /** CSS gradient for the hero. */
  background: string;
  /** Radial glow — the sun, or the moon after dark. */
  glow: string;
  /** Tint for the small orb beside the wordmark. */
  orb: string;
  /** Whether the scene draws stars on top of the gradient. */
  stars: boolean;
};

/** Daylight phases show a sun; after dark shows the brand moon. */
export function isDaylight(phase: SkyPhase): boolean {
  return phase !== "night";
}
