import React from 'react';

// Reverse-chronological feeds read better as newer/older than prev/next.
export default function Pager({ page, pageCount, total, exact, noun = 'items', hasPrev, hasNext, onPrev, onNext, onGoto, loading }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      <button className="page-btn" onClick={onPrev} disabled={!hasPrev || loading}>← Newer</button>
      <label className="page-pick">
        <span>Page</span>
        <select
          value={page}
          onChange={(e) => onGoto(Number(e.target.value))}
          disabled={loading}
          aria-label="Go to page"
        >
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {/* `exact` is false once history runs past the server's window — say "3000+" then. */}
        <span>of {pageCount}{total ? ` · ${total}${exact ? '' : '+'} ${noun} total` : ''}</span>
      </label>
      <button className="page-btn" onClick={onNext} disabled={!hasNext || loading}>Older →</button>
    </nav>
  );
}
