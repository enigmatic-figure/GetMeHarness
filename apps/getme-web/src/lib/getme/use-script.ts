import { useEffect } from "react";

export function usePlayScript(
  playing: boolean,
  index: number,
  length: number,
  onStep: () => void,
  onSkip: () => void,
) {
  useEffect(() => {
    if (!playing || length === 0 || index >= length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      onSkip();
      return;
    }
    const timer = window.setTimeout(onStep, 460);
    return () => window.clearTimeout(timer);
  }, [playing, index, length, onStep, onSkip]);
}
