import { useEffect, useRef, useState } from "react";

export function useChartWidth(fallbackWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(fallbackWidth);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateWidth = (value: number) => {
      const nextWidth = Math.max(Math.round(value), 1);
      setMeasuredWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
    };
    const measure = () => updateWidth(element.getBoundingClientRect().width);

    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) updateWidth(entry.contentRect.width);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fallbackWidth]);

  return { ref, width: measuredWidth };
}
