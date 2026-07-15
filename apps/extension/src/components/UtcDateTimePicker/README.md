# UTC date-time picker model

`dateTimeModel.ts` contains deterministic UTC calendar projection, boundary,
and formatting helpers used by the shared `../UtcDateTimePicker.tsx` drawer.
The picker accepts multiple date boundaries, allowing a minimum and maximum to
constrain one calendar while keeping both boundary days available for
time-level validation. `CalendarDayButton.tsx` renders selectable, disabled,
and marked boundary-day states with keyboard-accessible tooltips. Neither
module has wallet, storage, network, or signing effects.
