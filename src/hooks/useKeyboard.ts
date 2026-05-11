import { useEffect } from 'react';

interface Bindings {
  togglePlay: () => void;
  transposeUp: () => void;
  transposeDown: () => void;
  resetAll: () => void;
  openImport: () => void;
  openEdit: () => void;
  capoUp: () => void;
  capoDown: () => void;
  toggleSimplify: () => void;
}

const isTextEditor = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export function useKeyboard(b: Bindings, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTextEditor(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'e') { e.preventDefault(); b.openEdit(); return; }
      if (meta && e.key.toLowerCase() === 'i') { e.preventDefault(); b.openImport(); return; }

      if (meta || e.altKey) return;

      switch (e.key) {
        case ' ':           e.preventDefault(); b.togglePlay(); break;
        case 'ArrowUp':     e.preventDefault(); b.transposeUp(); break;
        case 'ArrowDown':   e.preventDefault(); b.transposeDown(); break;
        case 'ArrowRight':  e.preventDefault(); b.capoUp(); break;
        case 'ArrowLeft':   e.preventDefault(); b.capoDown(); break;
        case 'r': case 'R': b.resetAll(); break;
        case 's': case 'S': b.toggleSimplify(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [b, enabled]);
}
