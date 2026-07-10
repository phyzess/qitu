import { describe, expect, it } from "vitest";
import { timeSeriesNavigation } from "../src/time-series-interaction";

describe("timeSeriesNavigation", () => {
  it("moves through points without crossing either boundary", () => {
    expect(timeSeriesNavigation("ArrowRight", 1, 3)).toEqual({ handled: true, nextIndex: 2 });
    expect(timeSeriesNavigation("ArrowRight", 2, 3)).toEqual({ handled: true, nextIndex: 2 });
    expect(timeSeriesNavigation("ArrowLeft", 0, 3)).toEqual({ handled: true, nextIndex: 0 });
  });

  it("supports vertical arrows and direct boundary keys", () => {
    expect(timeSeriesNavigation("ArrowDown", null, 4)).toEqual({ handled: true, nextIndex: 0 });
    expect(timeSeriesNavigation("ArrowUp", null, 4)).toEqual({ handled: true, nextIndex: 3 });
    expect(timeSeriesNavigation("ArrowUp", 3, 4)).toEqual({ handled: true, nextIndex: 2 });
    expect(timeSeriesNavigation("Home", 2, 4)).toEqual({ handled: true, nextIndex: 0 });
    expect(timeSeriesNavigation("End", 1, 4)).toEqual({ handled: true, nextIndex: 3 });
  });

  it("clears on Escape and ignores unrelated keys or empty data", () => {
    expect(timeSeriesNavigation("Escape", 2, 4)).toEqual({ handled: true, nextIndex: null });
    expect(timeSeriesNavigation("ArrowRight", null, 4)).toEqual({ handled: true, nextIndex: 0 });
    expect(timeSeriesNavigation("Enter", 2, 4)).toEqual({ handled: false, nextIndex: 2 });
    expect(timeSeriesNavigation("ArrowRight", null, 0)).toEqual({
      handled: false,
      nextIndex: null,
    });
  });
});
