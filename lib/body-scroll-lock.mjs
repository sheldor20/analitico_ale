// Locks belong to dialogs, not effect cleanup order. A replacement dialog can
// mount in a layout effect before the previous dialog's passive cleanup runs.
const locks = new WeakMap();
export function lockBodyScroll(body = typeof document === 'undefined' ? null : document.body) {
  if (!body) return () => {};
  let state = locks.get(body);
  if (!state) {
    state = { count: 0, overflow: body.style.overflow };
    locks.set(body, state);
  }
  state.count += 1;
  body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count -= 1;
    if (state.count === 0) {
      body.style.overflow = state.overflow;
      locks.delete(body);
    }
  };
}
