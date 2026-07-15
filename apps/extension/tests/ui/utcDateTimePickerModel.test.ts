import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalendarDays,
  getCalendarDayBoundaryState,
} from "../../src/components/UtcDateTimePicker/dateTimeModel";

test("calendar months keep a stable six-week grid", () => {
  for (const year of [2025, 2026, 2027]) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      assert.equal(buildCalendarDays(year, monthIndex).length, 42);
    }
  }
});

test("calendar boundaries disable only dates beyond the marked day", () => {
  const boundary = Date.UTC(2026, 6, 15, 12, 30) / 1000;
  const before = { year: 2026, monthIndex: 6, day: 14 };
  const same = { year: 2026, monthIndex: 6, day: 15 };
  const after = { year: 2026, monthIndex: 6, day: 16 };

  assert.deepEqual(getCalendarDayBoundaryState(before, boundary, "maximum"), {
    isBoundary: false,
    isDisabled: false,
  });
  assert.deepEqual(getCalendarDayBoundaryState(same, boundary, "maximum"), {
    isBoundary: true,
    isDisabled: false,
  });
  assert.deepEqual(getCalendarDayBoundaryState(after, boundary, "maximum"), {
    isBoundary: false,
    isDisabled: true,
  });
  assert.equal(
    getCalendarDayBoundaryState(before, boundary, "minimum").isDisabled,
    true,
  );
  assert.equal(
    getCalendarDayBoundaryState(after, boundary, "minimum").isDisabled,
    false,
  );
});
