"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * The one moving thing on the waiting screen: a chef mid-toss, looping for as
 * long as the kitchen still has the order.
 *
 * Someone on this screen is doing nothing but waiting, so the loop answers the
 * question they actually have — "is anything happening?" — in the register of a
 * food truck rather than a status field. It is decorative: the Cooking badge
 * directly above says the same thing in words, and that is what assistive tech
 * reads, so this is hidden from it.
 *
 * The still frame sits underneath and is the video's own frame 0, so the handoff
 * to playback is invisible and the card never reflows. Anyone who asked for
 * reduced motion — or whose browser refuses to autoplay — keeps that still and
 * never downloads the video at all.
 */
export function CookingAnimation() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotion(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!motion || !video) return;

    // Autoplay is only granted to muted video, and only reliably when muted is
    // set as a property rather than left to the attribute. Play is still allowed
    // to fail (low-power mode does refuse it) — the still frame stays up.
    video.muted = true;
    const play = () => {
      if (document.visibilityState === "visible") void video.play().catch(() => {});
    };
    play();

    // A phone left on this screen in someone's pocket shouldn't keep decoding.
    const onVisibility = () => {
      if (document.visibilityState === "visible") play();
      else video.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [motion]);

  return (
    <div
      aria-hidden
      // The artwork's own off-white, so the frame never flashes card-white
      // before the still paints.
      style={{ backgroundColor: "#f7f7f7" }}
      className="relative aspect-[720/496] w-full overflow-hidden rounded-xl"
    >
      <Image
        src="/chef-tossing-poster.jpg"
        alt=""
        fill
        sizes="(max-width: 34rem) 100vw, 30rem"
        priority
        className="object-cover"
      />
      {motion && (
        <video
          ref={videoRef}
          src="/chef-tossing.mp4"
          className="absolute inset-0 size-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
        />
      )}
    </div>
  );
}
