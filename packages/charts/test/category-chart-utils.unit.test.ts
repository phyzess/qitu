import { describe, expect, it } from "vitest";
import { createElement } from "react";
import {
  categoryShare,
  categoryTotal,
  fitTextFontSize,
  tooltipCoordinates,
} from "../src/category-chart-utils";
import { tooltipAnnouncement } from "../src/chart-interaction";

describe("category chart interaction geometry", () => {
  it("uses the requested share basis for signed and positive category charts", () => {
    const data = [
      { label: "gain", value: 30 },
      { label: "loss", value: -10 },
    ];

    expect(categoryTotal(data, "absolute")).toBe(40);
    expect(categoryShare(-10, 40, "absolute")).toBe(0.25);
    expect(categoryTotal(data, "positive")).toBe(30);
    expect(categoryShare(-10, 30, "positive")).toBe(0);
  });

  it("keeps tooltip coordinates inside narrow chart bounds", () => {
    expect(tooltipCoordinates({ chartWidth: 180, height: 120, x: 175, y: 116 })).toEqual({
      left: 8,
      top: 8,
      width: 176,
    });
  });

  it("fits long donut center labels without exceeding font limits", () => {
    expect(fitTextFontSize("12", 80, 18, 10)).toBe(18);
    expect(fitTextFontSize("12345678901234567890", 30, 18, 10)).toBe(10);
  });

  it("announces numeric zero and formatted React content", () => {
    expect(
      tooltipAnnouncement(0, [{ label: "value", value: createElement("strong", null, 0) }]),
    ).toBe("0. value: 0");
  });
});
