import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const SESSION_KEY = "marvel-nexus-splash-seen";

type SplashPhase = "checking" | "playing" | "leaving" | "hidden";

/**
 * Marvel Studios-style opener, compressed to under three seconds: a giant
 * white MARVEL wordmark zooms out on black, a flash floods the screen red,
 * and the mark settles into the white-on-red studio title card with NEXUS
 * set between rules beneath it.
 */
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
    const timer = window.setTimeout(finish, reduced ? 900 : 2450);
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
    const timer = window.setTimeout(() => setPhase("hidden"), 520);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "checking" || phase === "hidden") return null;

  return (
    <div
      className={`nexus-splash ${phase === "leaving" ? "is-leaving" : ""}`}
      role="status"
      aria-label="Marvel Nexus is loading"
    >
      <div className="splash-red" aria-hidden="true" />
      <div className="splash-flash" aria-hidden="true" />
      <div className="splash-mark" aria-hidden="true">
        <span className="splash-marvel">MARVEL</span>
        <span className="splash-nexus">NEXUS</span>
      </div>
      <div className="splash-vignette" aria-hidden="true" />
      <button className="splash-skip" type="button" onClick={finish}>
        Skip intro <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
