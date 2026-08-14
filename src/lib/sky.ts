import "server-only";

/**
 * The customer menu wears the sky outside the truck.
 *
 * Two inputs: what time it is in Kolkata, and what the weather is doing over
 * campus. Both resolve to a palette + an optional particle effect. This is
 * decoration with a job — someone opening the app at 3pm and someone opening it
 * at 11pm should feel like they're looking at two different places.
 *
 * The canteen runs 11:00 → 24:00 IST, so the phases below are tuned to a
 * service that starts in daylight and ends well after dark.
 */

import type { Sky, SkyCondition, SkyPhase } from "@/lib/sky-types";

export type { Sky, SkyCondition, SkyPhase } from "@/lib/sky-types";

// Karjat / Vijaybhoomi. Overridable without a redeploy if the truck moves.
const LAT = Number(process.env.CAMPUS_LAT ?? "18.9107");
const LON = Number(process.env.CAMPUS_LON ?? "73.3233");

/** Hour 0–23 in IST. Fixed +5:30 offset — India has no DST. */
export function istHour(at: Date = new Date()): number {
  return new Date(at.getTime() + 5.5 * 3600_000).getUTCHours();
}

function phaseFor(hour: number): SkyPhase {
  if (hour >= 11 && hour < 14) return "morning";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 19) return "golden";
  return "night"; // 19:00 → 10:59 — the original midnight blue
}

/** Open-Meteo WMO weather codes → the three states worth drawing. */
function conditionFor(code: number | null): SkyCondition {
  if (code == null) return "clear";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) {
    return "rain";
  }
  if (code >= 71 && code <= 86) return "rain"; // sleet/snow — draw as rain
  if (code >= 1 && code <= 48) return "cloud";
  return "clear";
}

/**
 * Current weather over campus. Open-Meteo is free and needs no API key, so
 * there's no secret to leak and nothing to bill. Cached for 10 minutes — the
 * weather does not change faster than that, and this sits on the menu page.
 *
 * Returns null on any failure; the sky then renders on time-of-day alone.
 */
async function fetchWeatherCode(): Promise<number | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&current=weather_code&timezone=Asia%2FKolkata`;
    const res = await fetch(url, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { current?: { weather_code?: number } };
    const code = data.current?.weather_code;
    return typeof code === "number" ? code : null;
  } catch {
    // Never let the decoration break the menu.
    return null;
  }
}

const LABELS: Record<SkyPhase, Record<SkyCondition, string>> = {
  morning: { clear: "Sunny morning", cloud: "Cloudy morning", rain: "Rainy morning" },
  afternoon: { clear: "Sunny afternoon", cloud: "Grey afternoon", rain: "Rainy afternoon" },
  golden: { clear: "Golden hour", cloud: "Overcast evening", rain: "Rainy evening" },
  night: { clear: "Clear night", cloud: "Cloudy night", rain: "Rainy night" },
};

/**
 * Palettes. Each phase has a clear version and a drained one for cloud/rain —
 * the same sky with the light taken out of it, rather than a different hue.
 */
const PALETTES: Record<SkyPhase, Record<"clear" | "dim", Omit<Sky, "phase" | "condition" | "label">>> = {
  morning: {
    clear: {
      background: "linear-gradient(158deg, #2f7fc4 0%, #6fb6e0 55%, #f5d9a8 130%)",
      glow: "radial-gradient(circle, rgba(255,246,214,0.95) 0%, rgba(255,214,140,0.32) 40%, transparent 70%)",
      orb: "#fff3cf",
      stars: false,
    },
    dim: {
      background: "linear-gradient(158deg, #4a5f73 0%, #7d919f 58%, #b9c3c6 130%)",
      glow: "radial-gradient(circle, rgba(233,240,245,0.55) 0%, rgba(200,214,222,0.2) 42%, transparent 70%)",
      orb: "#e4ecf1",
      stars: false,
    },
  },
  afternoon: {
    clear: {
      background: "linear-gradient(158deg, #1f6fbd 0%, #58a8dd 50%, #ffe1a8 135%)",
      glow: "radial-gradient(circle, rgba(255,251,224,0.98) 0%, rgba(255,206,110,0.34) 38%, transparent 68%)",
      orb: "#fff6d0",
      stars: false,
    },
    dim: {
      background: "linear-gradient(158deg, #46586a 0%, #74879a 55%, #a8b6bd 130%)",
      glow: "radial-gradient(circle, rgba(228,236,243,0.5) 0%, rgba(190,205,215,0.18) 42%, transparent 70%)",
      orb: "#dde7ee",
      stars: false,
    },
  },
  golden: {
    clear: {
      background: "linear-gradient(155deg, #2b2f6b 0%, #8f4a6e 42%, #e8934f 110%)",
      glow: "radial-gradient(circle, rgba(255,196,116,0.95) 0%, rgba(240,132,74,0.34) 40%, transparent 70%)",
      orb: "#ffc98a",
      stars: false,
    },
    dim: {
      background: "linear-gradient(155deg, #2c3350 0%, #57506b 48%, #8e6f70 125%)",
      glow: "radial-gradient(circle, rgba(226,186,166,0.5) 0%, rgba(180,140,130,0.2) 42%, transparent 70%)",
      orb: "#e6c4ab",
      stars: false,
    },
  },
  night: {
    // The original brand sky — midnight indigo with an amber lamp glow.
    clear: {
      background: "linear-gradient(142deg, #080d1f 0%, #18294a 42%, #b96d35 145%)",
      glow: "radial-gradient(circle, rgba(255,192,112,0.9) 0%, rgba(242,155,70,0.28) 38%, transparent 70%)",
      orb: "#ffcf94",
      stars: true,
    },
    dim: {
      background: "linear-gradient(142deg, #0a0f1c 0%, #1d2739 46%, #5c5259 140%)",
      glow: "radial-gradient(circle, rgba(198,196,206,0.42) 0%, rgba(150,150,166,0.16) 42%, transparent 70%)",
      orb: "#cfd4e0",
      stars: false, // clouds hide the stars
    },
  },
};

/** Resolves the current sky. Safe to call from any Server Component. */
export async function getSky(): Promise<Sky> {
  const phase = phaseFor(istHour());
  const condition = conditionFor(await fetchWeatherCode());
  const variant = condition === "clear" ? "clear" : "dim";
  return {
    phase,
    condition,
    label: LABELS[phase][condition],
    ...PALETTES[phase][variant],
  };
}
