import { useEffect, useState } from "react";
import { nextPremiere, type Story } from "../lib/graph";

/**
 * "Avengers: Doomsday in 68 days" — whichever announced premiere is next.
 *
 * Renders nothing on the server and on the first client render: the day count
 * depends on the reader's clock, and baking the build date into the HTML would
 * both go stale and fail hydration. When the last announced date passes, the
 * whole strip simply stops appearing.
 */
export default function PremiereCountdown({
  stories,
  activeId,
  onTrace,
}: {
  stories: readonly Story[];
  /** The current destination, so the button can say it is already showing. */
  activeId: string | null;
  onTrace: (id: string) => void;
}) {
  const [next, setNext] = useState<ReturnType<typeof nextPremiere>>(null);

  useEffect(() => {
    const update = () => setNext(nextPremiere(stories, new Date()));
    update();
    // Roll over at most once an hour; nobody keeps this open for days, but a
    // stale "1 day" on premiere morning would be a poor look.
    const timer = window.setInterval(update, 3_600_000);
    return () => window.clearInterval(timer);
  }, [stories]);

  if (!next) return null;
  const { story, days } = next;
  const date = new Date(`${story.premiere}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const showing = activeId === story.id;

  return (
    <div className="premiere-countdown" role="status">
      <span className="premiere-days">
        <b>{days === 0 ? "Today" : days}</b>
        {days > 0 && <i>{days === 1 ? "day" : "days"}</i>}
      </span>
      <span className="premiere-copy">
        <small>In theaters {date}</small>
        <strong>{story.title}</strong>
      </span>
      <button type="button" onClick={() => onTrace(story.id)} disabled={showing}>
        {showing ? "Path shown" : "Get ready ↗"}
      </button>
    </div>
  );
}
