import { useEffect, useState } from "react";

export const clock = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Times a call from the moment it's answered. Lives above the tabs on purpose: kept
// inside the dialer it was torn down and restarted every time you switched tab.
export function useCallTimer(call) {
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    if (!call) {
      setStartedAt(null);
      return undefined;
    }
    // An incoming call answered from the overlay is already open by the time we see it,
    // so its 'accept' event has come and gone — read the status instead of waiting.
    if (call.status?.() === "open") setStartedAt(Date.now());
    else setStartedAt(null);
    const onAccept = () => setStartedAt(Date.now());
    call.on("accept", onAccept);
    return () => {
      try {
        call.off("accept", onAccept);
      } catch {
        /* noop */
      }
    };
  }, [call]);

  // Tick off the stored timestamp, so a throttled background tab can't drift the count.
  useEffect(() => {
    if (!startedAt) return undefined;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [startedAt]);

  return { startedAt, elapsed };
}
