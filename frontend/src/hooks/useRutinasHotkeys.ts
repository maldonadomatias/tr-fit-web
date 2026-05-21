import { useEffect } from 'react';

type Handlers = {
  onApprove?: () => void;
  onReject?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onTab?: (idx: 1 | 2 | 3 | 4) => void;
  onShortcuts?: () => void;
  onEsc?: () => void;
};

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useRutinasHotkeys(
  handlers: Handlers,
  { enabled = true }: { enabled?: boolean } = {},
) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handlers.onEsc?.();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          handlers.onApprove?.();
          break;
        case 'r':
          e.preventDefault();
          handlers.onReject?.();
          break;
        case 'j':
          e.preventDefault();
          handlers.onNext?.();
          break;
        case 'k':
          e.preventDefault();
          handlers.onPrev?.();
          break;
        case '?':
          e.preventDefault();
          handlers.onShortcuts?.();
          break;
        case '1':
          handlers.onTab?.(1);
          break;
        case '2':
          handlers.onTab?.(2);
          break;
        case '3':
          handlers.onTab?.(3);
          break;
        case '4':
          handlers.onTab?.(4);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, handlers]);
}
