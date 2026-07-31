/**
 * Watched tick.
 *
 * Drawn rather than typed: the "✓" glyph varies in shape and weight by font,
 * and inside a small button the UA's default padding pushes it off-centre.
 * A stroked polyline is centred by its own geometry and takes its weight from
 * stroke-width.
 */
export function CheckIcon() {
  return (
    <svg className="check-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5 L10 17.5 L19 7" />
    </svg>
  );
}

/** Three nodes and two edges — "open this in the dependency graph". */
export function GraphIcon() {
  return (
    <svg className="graph-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.6 10.1 L14.5 6.4 M7.6 13.9 L14.5 17.6" />
      <circle cx="5" cy="12" r="2.6" />
      <circle cx="17.5" cy="5" r="2.6" />
      <circle cx="17.5" cy="19" r="2.6" />
    </svg>
  );
}

/**
 * Magnifier whose lens is spun with a spider web.
 *
 * Geometry: lens circle r=7.5 at (13.5, 13.5). Eight spokes at 45 degrees drawn
 * as four diameters out to r=7.2. Two rings of silk (r=5.6 and r=3.0) built from
 * quadratic segments between consecutive spokes, each control point pulled in to
 * 0.80r — the true circular midpoint sits at 0.9239r, so the shortfall is what
 * bows each strand inward the way real silk hangs.
 */
export function NexusSearchIcon() {
  return (
    <svg className="nexus-search-icon" viewBox="0 0 32 32" aria-hidden="true">
      <circle className="lens" cx="13.5" cy="13.5" r="7.5" />
      <path className="handle" d="M19 19l8 8" />
      <g className="web">
        <path
          className="web-spokes"
          d="M13.5 6.3V20.7M6.3 13.5H20.7M8.41 8.41L18.59 18.59M18.59 8.41L8.41 18.59"
        />
        <path
          className="web-ring web-ring-outer"
          d="M19.10 13.50 Q17.64 15.21 17.46 17.46 Q15.21 17.64 13.50 19.10
             Q11.79 17.64 9.54 17.46 Q9.36 15.21 7.90 13.50
             Q9.36 11.79 9.54 9.54 Q11.79 9.36 13.50 7.90
             Q15.21 9.36 17.46 9.54 Q17.64 11.79 19.10 13.50 Z"
        />
        <path
          className="web-ring web-ring-inner"
          d="M16.50 13.50 Q15.72 14.42 15.62 15.62 Q14.42 15.72 13.50 16.50
             Q12.58 15.72 11.38 15.62 Q11.38 14.42 10.50 13.50
             Q11.38 12.58 11.38 11.38 Q12.58 11.28 13.50 10.50
             Q14.42 11.28 15.62 11.38 Q15.72 12.58 16.50 13.50 Z"
        />
      </g>
    </svg>
  );
}
