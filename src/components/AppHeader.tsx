import BrandLockup from "./BrandLockup";
import { NexusSearchIcon } from "./icons";
import type { NexusPage } from "./MarvelNexus";

/**
 * Sticky app bar. On scroll it compacts and slides the page title in beside the
 * lockup, which stays at full size.
 */
export default function AppHeader({
  page,
  compact,
  searchTriggerRef,
  onOpenSearch,
}: {
  page: NexusPage;
  compact: boolean;
  searchTriggerRef: React.RefObject<HTMLButtonElement | null>;
  onOpenSearch: () => void;
}) {
  const links = [
    { href: "/", label: "Home", key: "home" },
    { href: "/graph", label: "Graph", key: "graph" },
    { href: "/timeline", label: "Timeline", key: "timeline" },
  ] as const;

  return (
    <header className={`topbar workspace-topbar ${compact ? "is-compact" : ""}`}>
      {/* position:fixed, not in flow: .topbar is a grid with explicit columns,
          so an in-flow child here would claim a track. */}
      <a className="skip-link" href="#nexus-main">Skip to content</a>
      {/* The link carries the accessible name, so the lockup stays decorative. */}
      <a className="brand" href="/" aria-label="Marvel Nexus home">
        <span className="brand-name"><BrandLockup /></span>
        {page !== "home" && (
          <span className="compact-page-title">
            {page === "graph" ? "Dependency graph" : "MCU timeline"}
          </span>
        )}
      </a>
      <nav className="view-switch" aria-label="Explore Marvel Nexus">
        {links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            aria-current={page === link.key ? "page" : undefined}
            className={page === link.key ? "active" : ""}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <button
        ref={searchTriggerRef}
        className="search-trigger icon-search"
        onClick={onOpenSearch}
        aria-label="Search Marvel titles"
      >
        <NexusSearchIcon />
      </button>
    </header>
  );
}
