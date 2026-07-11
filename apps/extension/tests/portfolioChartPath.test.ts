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

  assert.match(path, /C 70\.1 12\.5 70\.9 51\.3 71 55/);
  assert.doesNotMatch(path, /C 81\./);
});

test("does not curve beyond either endpoint value", () => {
  const path = buildPortfolioChartPath([
    { x: 0, y: 20 },
    { x: 40, y: 5 },
    { x: 60, y: 58 },
    { x: 100, y: 10 },
  ]);

  assert.match(path, /C 42 8\.8 58 57\.5 60 58/);
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
