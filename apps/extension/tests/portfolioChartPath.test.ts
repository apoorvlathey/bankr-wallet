import assert from "node:assert/strict";
import test from "node:test";
import { buildPortfolioChartPath } from "../src/components/portfolioChartPath";

test("keeps curve handles inside tightly clustered timestamp segments", () => {
  const path = buildPortfolioChartPath([
    { x: 0, y: 10 },
    { x: 70, y: 8 },
    { x: 71, y: 55 },
    { x: 100, y: 45 },
  ]);

  assert.match(path, /C 70\.33333333333333 8 70\.66666666666667 55 71 55/);
});

test("uses elapsed time when smoothing unevenly spaced rising samples", () => {
  const path = buildPortfolioChartPath([
    { x: 0, y: 50 },
    { x: 10, y: 40 },
    { x: 90, y: 20 },
    { x: 100, y: 10 },
  ]);

  // The tangent at x=10 is weighted by the 10/80 timestamp gaps. It should
  // gently leave the sample, rather than using an equal-spacing Catmull slope.
  assert.match(path, /C 3\.3333333333333335 46\.666666666666664 6\.666666666666666 41\.578947368421055 10 40/);
});

test("does not curve beyond either endpoint value", () => {
  const path = buildPortfolioChartPath([
    { x: 0, y: 20 },
    { x: 40, y: 5 },
    { x: 60, y: 58 },
    { x: 100, y: 10 },
  ]);

  assert.match(path, /C 13\.333333333333334 15 26\.666666666666664 5 40 5/);
  assert.match(path, /C 46\.666666666666664 5 53\.333333333333336 58 60 58/);
});

test("falls back to a straight segment for duplicate x positions", () => {
  assert.equal(
    buildPortfolioChartPath([
      { x: 10, y: 20 },
      { x: 10, y: 40 },
    ]),
    "M 10 20 L 10 40",
  );
});
