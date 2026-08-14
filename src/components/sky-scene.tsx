"use client";

import { useEffect, useRef } from "react";
import type { SkyCondition } from "@/lib/sky-types";

/**
 * Ambient weather over the hero: rain streaks when it's raining, a slow
 * starfield after dark. Canvas rather than DOM nodes so a few hundred particles
 * cost one layer instead of a few hundred.
 *
 * Deliberately quiet — this sits behind the menu, and a customer trying to order
 * a chai at 1am should register it as atmosphere, not as something moving.
 *
 * Stops when the tab is hidden, and renders one static frame (or nothing) for
 * anyone who asked for reduced motion.
 */
export function SkyScene({
  condition,
  stars,
}: {
  condition: SkyCondition;
  stars: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rain = condition === "rain";

  useEffect(() => {
    if (!rain && !stars) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;

    type Drop = { x: number; y: number; len: number; vy: number; a: number };
    type Star = { x: number; y: number; r: number; base: number; phase: number };

    let drops: Drop[] = [];
    let starField: Star[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Scale particle counts to area so a tablet isn't sparse and a phone
      // isn't overloaded.
      const area = width * height;
      if (rain) {
        const n = Math.round(Math.min(150, area / 2600));
        drops = Array.from({ length: n }, () => spawnDrop(true));
      }
      if (stars) {
        const n = Math.round(Math.min(90, area / 5200));
        starField = Array.from({ length: n }, () => ({
          x: Math.random() * width,
          // Keep stars in the upper reaches — the lower hero is warm horizon.
          y: Math.random() * height * 0.72,
          r: Math.random() * 1.1 + 0.35,
          base: Math.random() * 0.35 + 0.25,
          phase: Math.random() * Math.PI * 2,
        }));
      }
    };

    const spawnDrop = (seed = false): Drop => ({
      x: Math.random() * (width + 120) - 60,
      y: seed ? Math.random() * height : -20,
      len: Math.random() * 14 + 8,
      vy: Math.random() * 260 + 320, // px/sec
      a: Math.random() * 0.18 + 0.1,
    });

    let last = performance.now();

    const frame = (t: number) => {
      if (!running) return;
      const dt = Math.min((t - last) / 1000, 0.05); // clamp after a background tab
      last = t;
      ctx.clearRect(0, 0, width, height);

      if (stars) {
        for (const s of starField) {
          const tw = reduced ? s.base : s.base + Math.sin(t / 900 + s.phase) * 0.18;
          ctx.globalAlpha = Math.max(0.06, tw);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = "#fff8e8";
          ctx.fill();
        }
      }

      if (rain) {
        ctx.strokeStyle = "#dbe7f5";
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        for (const d of drops) {
          ctx.globalAlpha = d.a;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          // Slight slant — wind, and it reads as rain rather than static lines.
          ctx.lineTo(d.x - d.len * 0.22, d.y + d.len);
          ctx.stroke();

          if (!reduced) {
            d.y += d.vy * dt;
            d.x -= d.vy * dt * 0.22;
            if (d.y > height + 20) Object.assign(d, spawnDrop());
          }
        }
      }

      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!running) {
          running = true;
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      } else {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rain, stars]);

  if (!rain && !stars) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
