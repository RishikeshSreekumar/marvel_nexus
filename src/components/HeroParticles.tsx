import { useEffect, useRef } from "react";
import type { Lane } from "../lib/graph";

/**
 * The hero's weather system: a canvas layer over the Yggdrasil SVG.
 *
 * The SVG stays in charge of everything with meaning — links, labels, focus,
 * watched progress. This layer only paints what SVG cannot afford: dozens of
 * glowing motes flowing up the trunk, splitting at the nexus event and riding
 * out along each bough, tinted from timeline-gold into the lane's own colour.
 * Animating that many independent travellers as SVG nodes means a style
 * recalculation per mote per frame; on canvas it is one clear and one pass of
 * arcs in additive blend.
 *
 * Geometry is not re-derived: the trunk and bough cubics come in as props from
 * the same tables the SVG renders, so the flow can never drift off its rails.
 */

export type FlowCurve = {
  p0: readonly [number, number];
  c1: readonly [number, number];
  c2: readonly [number, number];
  p3: readonly [number, number];
};

export type FlowLane = {
  lane: Lane;
  curve: FlowCurve;
  /** Title count — heavier lanes carry proportionally more traffic. */
  weight: number;
};

/** Fraction of a mote's journey spent on the trunk before its bough. */
const TRUNK_FRAC = 0.3;

/** Where along the journey trunk-gold has fully given way to lane colour. */
const TINT_END = 0.58;

type Mote = {
  laneIndex: number;
  /** 0..1 across trunk + bough. Starts negative so arrivals stagger. */
  t: number;
  speed: number;
  size: number;
  /** Fixed perpendicular-ish drift, so the stream has width. */
  jx: number;
  jy: number;
  twinkle: number;
};

type Dust = { x: number; y: number; vy: number; size: number; alpha: number };

function cubicAt(curve: FlowCurve, t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  const { p0, c1, c2, p3 } = curve;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}

function parseColor(value: string, fallback: [number, number, number]) {
  const hex = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!hex) return fallback;
  const n = parseInt(hex[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number];
}

const LANE_VARS: Record<Lane, string> = {
  Infinity: "--lane-infinity",
  Multiverse: "--lane-multiverse",
  Street: "--lane-street",
  Legacy: "--lane-legacy",
  Future: "--lane-future",
};

export default function HeroParticles({
  trunk,
  lanes,
  viewBox,
  active,
}: {
  trunk: FlowCurve;
  lanes: readonly FlowLane[];
  viewBox: readonly [number, number];
  active: Lane | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read through a ref inside the frame loop, so a hover never restarts the
  // whole animation effect — it only changes what the next frame draws.
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    // The CSS also hides the canvas under reduced motion; skipping the loop
    // entirely means it costs nothing rather than animating behind display:none.
    if (reduced.matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const styles = getComputedStyle(canvas);
    const gold = parseColor(styles.getPropertyValue("--gold"), [230, 182, 94]);
    const laneColors = lanes.map(({ lane }) =>
      parseColor(styles.getPropertyValue(LANE_VARS[lane]), gold),
    );
    const totalWeight = lanes.reduce((sum, { weight }) => sum + weight, 0);

    /** Weighted lane pick; the hovered lane draws extra traffic. */
    const pickLane = () => {
      const boost = 2.4;
      const activeIndex = lanes.findIndex(({ lane }) => lane === activeRef.current);
      const total = totalWeight + (activeIndex >= 0 ? lanes[activeIndex].weight * (boost - 1) : 0);
      let roll = Math.random() * total;
      for (let i = 0; i < lanes.length; i++) {
        roll -= lanes[i].weight * (i === activeIndex ? boost : 1);
        if (roll <= 0) return i;
      }
      return lanes.length - 1;
    };

    const spawn = (mote: Mote, initial: boolean) => {
      mote.laneIndex = pickLane();
      // Initial fill spreads motes along the whole run so the tree is alive on
      // frame one; respawns queue up below zero so arrivals stay staggered.
      mote.t = initial ? Math.random() : -Math.random() * 0.2;
      mote.speed = 0.12 + Math.random() * 0.1;
      mote.size = 1 + Math.random() * 1.6;
      mote.jx = (Math.random() - 0.5) * 5;
      mote.jy = (Math.random() - 0.5) * 4;
      mote.twinkle = Math.random() * Math.PI * 2;
    };

    const motes: Mote[] = Array.from({ length: 72 }, () => {
      const mote = {} as Mote;
      spawn(mote, true);
      return mote;
    });

    const dust: Dust[] = Array.from({ length: 26 }, () => ({
      x: Math.random() * viewBox[0],
      y: Math.random() * viewBox[1],
      vy: 2 + Math.random() * 5,
      size: 0.6 + Math.random() * 1,
      alpha: 0.04 + Math.random() * 0.1,
    }));

    let scale = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      scale = (rect.width * dpr) / viewBox[0];
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    const started = last;
    let running = false;

    const positionOf = (mote: Mote): [number, number] => {
      if (mote.t < TRUNK_FRAC) return cubicAt(trunk, Math.max(0, mote.t) / TRUNK_FRAC);
      return cubicAt(lanes[mote.laneIndex].curve, (mote.t - TRUNK_FRAC) / (1 - TRUNK_FRAC));
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, viewBox[0], viewBox[1]);
      // Fade the whole layer in on the boughs' own schedule, so motes never
      // ride branches that have not grown yet.
      const ramp = Math.min(1, Math.max(0, (now - started - 1000) / 1600));
      if (ramp === 0) return;
      ctx.globalCompositeOperation = "lighter";

      for (const speck of dust) {
        speck.y -= speck.vy * dt;
        if (speck.y < -4) {
          speck.y = viewBox[1] + 4;
          speck.x = Math.random() * viewBox[0];
        }
        ctx.globalAlpha = speck.alpha * ramp;
        ctx.fillStyle = "rgb(214, 205, 186)";
        ctx.beginPath();
        ctx.arc(speck.x, speck.y, speck.size, 0, Math.PI * 2);
        ctx.fill();
      }

      const activeIndex = lanes.findIndex(({ lane }) => lane === activeRef.current);
      for (const mote of motes) {
        mote.t += mote.speed * dt;
        if (mote.t >= 1) spawn(mote, false);
        if (mote.t < 0) continue;

        const [x, y] = positionOf(mote);
        // Journey-shaped envelope: born dim in Loki's hands, brightest through
        // the fork, gone by the bough tip so it never sits on a label.
        const envelope = Math.sin(Math.PI * mote.t) ** 0.7;
        const twinkle = 0.8 + 0.2 * Math.sin(mote.twinkle + now / 260);
        const dimmed = activeIndex >= 0 && mote.laneIndex !== activeIndex && mote.t > TRUNK_FRAC;
        const emphasis = dimmed ? 0.22 : activeIndex === mote.laneIndex ? 1.35 : 1;

        const tint = Math.min(1, Math.max(0, (mote.t - TRUNK_FRAC) / (TINT_END - TRUNK_FRAC)));
        const lane = laneColors[mote.laneIndex];
        const r = Math.round(gold[0] + (lane[0] - gold[0]) * tint);
        const g = Math.round(gold[1] + (lane[1] - gold[1]) * tint);
        const b = Math.round(gold[2] + (lane[2] - gold[2]) * tint);

        // The stream widens as it leaves the trunk: jitter scales with t.
        const spreadX = x + mote.jx * mote.t;
        const spreadY = y + mote.jy * mote.t;
        const alpha = envelope * twinkle * emphasis * ramp;

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.globalAlpha = alpha * 0.16;
        ctx.beginPath();
        ctx.arc(spreadX, spreadY, mote.size * 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.85;
        ctx.beginPath();
        ctx.arc(spreadX, spreadY, mote.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    // Run only while both on screen and on a visible tab; a hero that keeps
    // burning frames under another tab is a battery bug, not ambience.
    let onScreen = true;
    const setRunning = (next: boolean) => {
      if (next === running) return;
      running = next;
      if (next) {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      } else {
        cancelAnimationFrame(frame);
      }
    };
    const visibility = () => setRunning(onScreen && !document.hidden);
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      visibility();
    });
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", visibility);
    visibility();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [trunk, lanes, viewBox]);

  return <canvas className="hero-particles" ref={canvasRef} aria-hidden="true" />;
}
