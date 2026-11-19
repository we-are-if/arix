// Horizontal status navigation must also work over vertically scrolling cards.
(() => {
  let gesture = null;
  let suppressClickUntil = 0;
  let animation = 0;
  const mobile = () => matchMedia('(max-width: 700px)').matches;
  document.addEventListener('touchstart', event => {
    if (!mobile() || event.touches.length !== 1) return;
    const board = event.target.closest?.('.board-view > .board');
    if (!board || board.scrollWidth <= board.clientWidth) return;
    cancelAnimationFrame(animation);
    board.style.removeProperty('scroll-snap-type');
    const point = event.touches[0];
    gesture = { board, x: point.clientX, y: point.clientY, left: board.scrollLeft, axis: null,
      scale: board.getBoundingClientRect().width / board.offsetWidth || 1 };
  }, { passive: true });
  const finish = cancelled => {
    const current = gesture;
    gesture = null;
    if (!current || current.axis !== 'x') return;
    const board = current.board;
    suppressClickUntil = Date.now() + 400;
    if (!board.isConnected || cancelled) { board.style.removeProperty('scroll-snap-type'); return; }
    const bounds = board.getBoundingClientRect();
    const stops = Array.from(board.children).map(column =>
      Math.max(0, Math.min(board.scrollWidth - board.clientWidth,
        (column.getBoundingClientRect().left - bounds.left) / current.scale + board.scrollLeft - board.clientLeft)));
    let nearest = stops.reduce((best, stop) => Math.abs(stop - board.scrollLeft) < Math.abs(best - board.scrollLeft) ? stop : best, stops[0] ?? 0);
    const initial = stops.reduce((best, stop) => Math.abs(stop - current.left) < Math.abs(best - current.left) ? stop : best, stops[0] ?? 0);
    const distance = board.scrollLeft - current.left;
    if (nearest === initial && Math.abs(distance) > Math.max(65, board.clientWidth * 0.22)) {
      nearest = stops[Math.max(0, Math.min(stops.length - 1, stops.indexOf(initial) + Math.sign(distance)))];
    }
    // Restore snap only AFTER settling; restoring it first causes an instant jump.
    const from = board.scrollLeft;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    let started;
    const settle = time => {
      started ??= time;
      const progress = duration ? Math.min(1, (time - started) / duration) : 1;
      board.scrollLeft = from + (nearest - from) * (1 - Math.pow(1 - progress, 3));
      if (progress < 1 && board.isConnected) animation = requestAnimationFrame(settle);
      else board.style.removeProperty('scroll-snap-type');
    };
    animation = requestAnimationFrame(settle);
  };
  document.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1) { finish(true); return; }
    const point = event.touches[0];
    const dx = point.clientX - gesture.x;
    const dy = point.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (gesture.axis === 'x') gesture.board.style.scrollSnapType = 'none';
    }
    if (gesture.axis !== 'x') return;
    if (event.cancelable) event.preventDefault();
    gesture.board.scrollLeft = gesture.left - dx / gesture.scale;
  }, { passive: false });
  document.addEventListener('touchend', () => finish(false), { passive: true });
  document.addEventListener('touchcancel', () => finish(true), { passive: true });
  document.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil && event.target.closest?.('.board-view > .board')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
