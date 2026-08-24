import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import BrandLockup from "./BrandLockup";

const SESSION_KEY = "marvel-nexus-splash-seen";

const frames = [
  "INFINITY",
  "MULTIVERSE",
  "LEGACY",
  "STREET LEVEL",
  "THE TIMELINE",
  "EVERY STORY CONNECTS",
];

type SplashPhase = "checking" | "playing" | "leaving" | "hidden";

export default function SplashScreen() {
  const [phase, setPhase] = useState<SplashPhase>("checking");

  const finish = useCallback(() => {
    if (phase === "hidden" || phase === "leaving") return;
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
    setPhase("leaving");
  }, [phase]);

  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) {
        setPhase("hidden");
        return;
      }
    } catch {
      // A blocked sessionStorage should not block the application.
    }
    setPhase("playing");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    document.body.classList.add("splash-active");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(finish, reduced ? 1100 : 5600);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("splash-active");
    };
  }, [phase, finish]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("hidden"), 720);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "checking" || phase === "hidden") return null;

  return (
    <div
      className={`nexus-splash ${phase === "leaving" ? "is-leaving" : ""}`}
      role="status"
      aria-label="Marvel Nexus is loading"
    >
      <div className="splash-vignette" aria-hidden="true" />
      <div className="splash-reel" aria-hidden="true">
        {frames.map((frame, index) => (
          <span key={frame} style={{ "--frame": index } as React.CSSProperties}>
            {frame}
          </span>
        ))}
      </div>
      <div className="splash-flare" aria-hidden="true" />
      <div className="splash-title" aria-hidden="true">
        <span className="splash-presents">THE STORIES OF A UNIVERSE</span>
        <BrandLockup labelled />
        <span className="splash-tagline">EVERY STORY CONNECTS</span>
      </div>
      <button className="splash-skip" type="button" onClick={finish}>
        Skip intro <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
