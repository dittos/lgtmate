import { useCallback, useEffect, useRef } from "react";

export type DiffScrollPosition = {
  top: number;
  left: number;
};

export type GetDiffScrollPosition = (path: string) => DiffScrollPosition | null;

export type SetDiffScrollPosition = (
  path: string,
  position: DiffScrollPosition
) => void;

export function useDiffScrollCache(resetKey: string) {
  const diffScrollPositionsRef = useRef<Record<string, DiffScrollPosition>>({});

  useEffect(() => {
    diffScrollPositionsRef.current = {};
  }, [resetKey]);

  const getDiffScrollPosition = useCallback<GetDiffScrollPosition>((path: string) => {
    return diffScrollPositionsRef.current[path] ?? null;
  }, []);

  const setDiffScrollPosition = useCallback<SetDiffScrollPosition>(
    (path: string, position: DiffScrollPosition) => {
      diffScrollPositionsRef.current[path] = position;
    },
    []
  );

  return {
    getDiffScrollPosition,
    setDiffScrollPosition
  };
}
