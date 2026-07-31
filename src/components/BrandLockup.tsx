/**
 * The Marvel Studios lockup, adapted to MARVEL NEXUS.
 *
 * Structure follows the real mark: a red plate carrying a light block with
 * MARVEL knocked out of it in red, then the second word set in white between a
 * rule above and a rule below.
 *
 *   ┌──────────────────────────────┐  red plate
 *   │ ┌────────┐   ──────────      │
 *   │ │ MARVEL │    N E X U S      │  light block, red MARVEL
 *   │ └────────┘   ──────────      │  NEXUS white, rules above/below
 *   └──────────────────────────────┘
 *
 * Deliberately CSS text rather than SVG. The plate has a fixed height but an
 * intrinsic width, so if Barlow Condensed fails to load the fallback's wider
 * metrics grow the block instead of clipping the wordmark.
 *
 * Everything scales from a single `--lockup-h` (see .brand-lockup in global.css).
 */
export default function BrandLockup({
  size = "bar",
  labelled = false,
}: {
  size?: "bar" | "footer";
  /**
   * Set when no ancestor already names the mark. The header wraps this in
   * `<a aria-label="Marvel Nexus home">`, so there it stays decorative.
   */
  labelled?: boolean;
}) {
  const a11y = labelled
    ? ({ role: "img", "aria-label": "Marvel Nexus" } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <span className={`brand-lockup brand-lockup-${size}`} {...a11y}>
      <span className="lockup-marvel">MARVEL</span>
      <span className="lockup-nexus">NEXUS</span>
    </span>
  );
}
