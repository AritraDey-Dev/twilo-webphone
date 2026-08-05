import React from "react";
import { clock } from "../useCallTimer";

// Sits under the tabs in the sidebar so a live call is always in view. Clicking it
// returns to the keypad; the dialer shows its own strip, so this only appears elsewhere.
export default function CallBar({ startedAt, elapsed, onOpen, onHangup }) {
  return (
    <div className="callbar">
      <button className="callbar-main" onClick={onOpen} title="Back to the keypad">
        <span className={`beacon ${startedAt ? "is-ready" : "is-connecting"}`} />
        <span className="callbar-label">
          {startedAt ? "In call" : "Connecting…"}
        </span>
        {startedAt && <span className="callbar-time">{clock(elapsed)}</span>}
      </button>
      <button className="callbar-end" onClick={onHangup}>
        End call
      </button>
    </div>
  );
}
