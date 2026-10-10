// Pages being gathered for one paper, shared by Capture → Confirm → Processing.
// Lives in memory only; cleared once the paper is saved or the person starts over.
import React, { createContext, useContext, useMemo, useState } from 'react';
import { MAX_PAGES } from '@scr/shared';
import type { PreparedPage } from './prepare';

interface CaptureApi {
  pages: PreparedPage[];
  add(pages: PreparedPage[]): void;
  replace(index: number, page: PreparedPage): void;
  remove(index: number): void;
  move(index: number, by: -1 | 1): void;
  clear(): void;
  full: boolean;
}

const Ctx = createContext<CaptureApi | null>(null);

export function useCapture() {
  const api = useContext(Ctx);
  if (!api) throw new Error('useCapture must be inside <CaptureProvider>');
  return api;
}

export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [pages, setPages] = useState<PreparedPage[]>([]);

  const api = useMemo<CaptureApi>(() => ({
    pages,
    full: pages.length >= MAX_PAGES,
    add: more => setPages(p => [...p, ...more].slice(0, MAX_PAGES)),
    replace: (i, page) => setPages(p => p.map((x, j) => (j === i ? page : x))),
    remove: i => setPages(p => p.filter((_, j) => j !== i)),
    move: (i, by) => setPages(p => {
      const j = i + by;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }),
    clear: () => setPages([]),
  }), [pages]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
