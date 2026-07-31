import { useEffect, useRef, useState } from "react";
import type { Story } from "../lib/graph";
import { artworkTitle } from "../lib/stories";

/**
 * Poster art fetched lazily from the Wikipedia REST summary API.
 *
 * The cache is module scope on purpose: it has to outlive individual mounts,
 * so the same title is never fetched twice in a session. Moving it into the
 * component (or a hook) would silently disable caching.
 */
const artworkCache = new Map<string, string | null>();

export default function StoryArtwork({
  story,
  variant = "poster",
}: {
  story: Story;
  variant?: "poster" | "backdrop" | "thumb";
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const lookupTitle = artworkTitle(story);
  const [src, setSrc] = useState<string | null | undefined>(
    artworkCache.get(lookupTitle),
  );

  useEffect(() => {
    if (src !== undefined) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(lookupTitle)}`,
        );
        const data = response.ok ? await response.json() : null;
        const image = data?.thumbnail?.source ?? data?.originalimage?.source ?? null;
        artworkCache.set(lookupTitle, image);
        if (!cancelled) setSrc(image);
      } catch {
        artworkCache.set(lookupTitle, null);
        if (!cancelled) setSrc(null);
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [lookupTitle, src]);

  return (
    <span
      ref={hostRef}
      className={`story-artwork story-artwork-${variant} artwork-${story.lane.toLowerCase()}`}
      aria-hidden="true"
    >
      {src && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="artwork-monogram">{story.title.replace(/^The /, "").charAt(0)}</span>
    </span>
  );
}

