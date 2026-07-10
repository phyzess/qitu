import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BarChart } from "../src/bar-chart";
import { DonutChart } from "../src/donut-chart";

describe("category chart markup", () => {
  const data = [
    { label: "North", value: 12 },
    { label: "South", value: 8 },
  ];

  it("keeps legend entries as native buttons with compatible defaults", () => {
    const markup = renderToStaticMarkup(
      createElement(BarChart, { data, legend: "inline", width: 420 }),
    );

    expect(markup).toContain('role="listitem"><button');
    expect(markup).toContain('class="qitu-chart-legend-item"');
    expect(markup).not.toContain('<button role="listitem"');
  });

  it("uses group semantics for an interactive donut", () => {
    const markup = renderToStaticMarkup(createElement(DonutChart, { data, width: 320 }));

    expect(markup).toContain('role="group"');
    expect(markup).toContain('role="list"');
    expect(markup).toContain('role="listitem"');
  });
});
