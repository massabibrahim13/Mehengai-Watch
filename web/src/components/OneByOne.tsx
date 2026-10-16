// Draws its children one at a time, each after the browser has painted the one before. Building the whole long page in
// one go froze slow phones for over a second, right while the hero was appearing; one section per frame keeps the
// screen moving (on a fast computer everything is in place within a few frames).
import { useEffect, useState, type ReactNode } from "react";

export function OneByOne({ children, onDone }: { children: ReactNode[]; onDone?: () => void }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= children.length) {
      onDone?.();
      return;
    }
    let timer = 0;
    // requestAnimationFrame runs just before the next paint; the timeout inside it runs just after
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setShown((n) => n + 1));
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [shown, children.length, onDone]);

  return <>{children.slice(0, shown)}</>;
}
