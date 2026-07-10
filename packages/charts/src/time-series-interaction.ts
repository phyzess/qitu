export type TimeSeriesNavigationResult = {
  handled: boolean;
  nextIndex: number | null;
};

export function timeSeriesNavigation(
  key: string,
  currentIndex: number | null,
  pointCount: number,
): TimeSeriesNavigationResult {
  if (pointCount <= 0) return { handled: false, nextIndex: currentIndex };

  if (currentIndex === null) {
    if (key === "ArrowLeft" || key === "ArrowUp") {
      return { handled: true, nextIndex: pointCount - 1 };
    }

    if (key === "ArrowRight" || key === "ArrowDown") {
      return { handled: true, nextIndex: 0 };
    }
  }

  const index = currentIndex ?? 0;

  if (key === "ArrowLeft" || key === "ArrowUp") {
    return { handled: true, nextIndex: Math.max(0, index - 1) };
  }

  if (key === "ArrowRight" || key === "ArrowDown") {
    return { handled: true, nextIndex: Math.min(pointCount - 1, index + 1) };
  }

  if (key === "Home") return { handled: true, nextIndex: 0 };
  if (key === "End") return { handled: true, nextIndex: pointCount - 1 };
  if (key === "Escape") return { handled: true, nextIndex: null };

  return { handled: false, nextIndex: currentIndex };
}
