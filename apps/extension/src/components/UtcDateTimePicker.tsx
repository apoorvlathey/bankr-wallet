import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Icon,
  IconButton,
  Select,
  SimpleGrid,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon, TimeIcon } from "@chakra-ui/icons";

import { useTheme } from "@/theme";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);

type UtcParts = {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
};

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function toUtcParts(seconds: number): UtcParts {
  const date = new Date(seconds * 1000);
  return {
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function toUtcSeconds(parts: UtcParts): number {
  return Math.floor(Date.UTC(
    parts.year,
    parts.monthIndex,
    parts.day,
    parts.hour,
    parts.minute,
  ) / 1000);
}

function formatUtcDisplay(seconds: number | null): string {
  if (seconds === null) return "Select date and time";
  const parts = toUtcParts(seconds);
  return `${SHORT_MONTHS[parts.monthIndex]} ${parts.day}, ${parts.year}, ${pad2(
    parts.hour,
  )}:${pad2(parts.minute)} UTC`;
}

function visibleMonthFromSeconds(seconds: number | null): {
  year: number;
  monthIndex: number;
} {
  const parts = toUtcParts(seconds ?? Math.floor(Date.now() / 1000));
  return { year: parts.year, monthIndex: parts.monthIndex };
}

function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
}

function buildCalendarDays(year: number, monthIndex: number) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const mondayBasedOffset = (firstDay + 6) % 7;
  const gridStartDay = 1 - mondayBasedOffset;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const gridLength = Math.max(
    35,
    Math.ceil((mondayBasedOffset + daysInMonth) / 7) * 7,
  );

  return Array.from({ length: gridLength }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, gridStartDay + index));
    return {
      year: date.getUTCFullYear(),
      monthIndex: date.getUTCMonth(),
      day: date.getUTCDate(),
      inVisibleMonth: date.getUTCMonth() === monthIndex,
    };
  });
}

function CalendarGlyph() {
  return (
    <Icon viewBox="0 0 20 20" boxSize={4}>
      <path
        fill="currentColor"
        d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 19 6.5v9A2.5 2.5 0 0 1 16.5 18h-13A2.5 2.5 0 0 1 1 15.5v-9A2.5 2.5 0 0 1 3.5 4H5V3a1 1 0 0 1 1-1Zm10.5 7h-13v6.5a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5V9ZM4 6a.5.5 0 0 0-.5.5V7h13v-.5A.5.5 0 0 0 16 6H4Z"
      />
    </Icon>
  );
}

export function UtcDateTimePicker({
  valueSeconds,
  disabled,
  label,
  onChange,
}: {
  valueSeconds: number | null;
  disabled: boolean;
  label: string;
  onChange: (seconds: number) => void;
}) {
  const { tokens } = useTheme();
  const { isOpen, onClose, onOpen } = useDisclosure();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedParts = valueSeconds === null ? null : toUtcParts(valueSeconds);
  const initialVisible = visibleMonthFromSeconds(valueSeconds);
  const [visibleYear, setVisibleYear] = useState(initialVisible.year);
  const [visibleMonthIndex, setVisibleMonthIndex] = useState(
    initialVisible.monthIndex,
  );

  useEffect(() => {
    if (!isOpen) return;
    const next = visibleMonthFromSeconds(valueSeconds);
    setVisibleYear(next.year);
    setVisibleMonthIndex(next.monthIndex);
  }, [isOpen, valueSeconds]);

  const days = useMemo(
    () => buildCalendarDays(visibleYear, visibleMonthIndex),
    [visibleMonthIndex, visibleYear],
  );
  const todayKey = useMemo(() => {
    const now = toUtcParts(Math.floor(Date.now() / 1000));
    return `${now.year}-${now.monthIndex}-${now.day}`;
  }, []);

  const selectedHour = selectedParts?.hour ?? 0;
  const selectedMinute = selectedParts?.minute ?? 0;

  const commit = (parts: UtcParts) => {
    onChange(toUtcSeconds(parts));
  };

  const currentParts = (): UtcParts => {
    if (selectedParts) return selectedParts;
    const now = toUtcParts(Math.floor(Date.now() / 1000));
    return {
      year: visibleYear,
      monthIndex: visibleMonthIndex,
      day: now.day,
      hour: now.hour,
      minute: now.minute,
    };
  };

  const selectDate = (year: number, monthIndex: number, day: number) => {
    setVisibleYear(year);
    setVisibleMonthIndex(monthIndex);
    commit({ ...currentParts(), year, monthIndex, day });
  };

  const selectHour = (hour: number) => {
    commit({ ...currentParts(), hour });
  };

  const selectMinute = (minute: number) => {
    commit({ ...currentParts(), minute });
  };

  const goToMonth = (delta: number) => {
    const next = shiftMonth(visibleYear, visibleMonthIndex, delta);
    setVisibleYear(next.year);
    setVisibleMonthIndex(next.monthIndex);
  };

  const selectToday = () => {
    const now = toUtcParts(Math.floor(Date.now() / 1000));
    setVisibleYear(now.year);
    setVisibleMonthIndex(now.monthIndex);
    commit({ ...now, hour: selectedHour, minute: selectedMinute });
  };

  return (
    <>
      <Button
          ref={triggerRef}
          type="button"
          aria-label={label}
          isDisabled={disabled}
          onClick={onOpen}
          variant="outline"
          w="full"
          h="46px"
          justifyContent="space-between"
          px={3}
          fontFamily="mono"
          fontWeight="800"
          bg="surface.sunken"
          border={tokens.borders.thin}
          borderColor="border.default"
          borderRadius={tokens.radii.input}
          _hover={{ bg: "surface.raisedHover" }}
      >
        <Text noOfLines={1}>{formatUtcDisplay(valueSeconds)}</Text>
        <CalendarGlyph />
      </Button>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        placement="bottom"
        finalFocusRef={triggerRef}
        returnFocusOnClose
      >
        <DrawerOverlay />
        <DrawerContent
          maxH="92dvh"
          borderTop={tokens.borders.thin}
          borderColor="border.default"
          borderTopRadius={tokens.radii.modal}
        >
          <DrawerCloseButton aria-label="Close date and time picker" boxSize="44px" />
          <DrawerHeader px={4} pt={5} pb={2} pr={16}>
            <Text as="h2" fontSize="lg">{label}</Text>
          </DrawerHeader>
          <DrawerBody px={4} py={2} overflowY="auto">
            <VStack align="stretch" spacing={3} maxW="320px" mx="auto">
            <HStack justify="space-between" px={0.5}>
              <IconButton
                aria-label="Previous month"
                icon={<ChevronLeftIcon />}
                size="xs"
                variant="ghost"
                onClick={() => goToMonth(-1)}
              />
              <Text fontSize="sm" fontWeight="900" color="text.primary">
                {MONTHS[visibleMonthIndex]} {visibleYear}
              </Text>
              <IconButton
                aria-label="Next month"
                icon={<ChevronRightIcon />}
                size="xs"
                variant="ghost"
                onClick={() => goToMonth(1)}
              />
            </HStack>

            <SimpleGrid columns={7} spacing="3px">
              {WEEKDAYS.map((weekday, index) => (
                <Text
                  key={`${weekday}-${index}`}
                  textAlign="center"
                  fontSize="2xs"
                  fontWeight="900"
                  color="text.secondary"
                  py={0.5}
                >
                  {weekday}
                </Text>
              ))}
              {days.map((day) => {
                const dayKey = `${day.year}-${day.monthIndex}-${day.day}`;
                const isSelected =
                  selectedParts?.year === day.year &&
                  selectedParts.monthIndex === day.monthIndex &&
                  selectedParts.day === day.day;
                const isToday = dayKey === todayKey;

                return (
                  <Button
                    key={dayKey}
                    type="button"
                    variant="ghost"
                    h="30px"
                    minW={0}
                    p={0}
                    borderRadius={tokens.radii.input}
                    border="1px solid"
                    borderColor={
                      isSelected
                        ? "accent.secondary"
                        : isToday
                          ? "border.default"
                          : "transparent"
                    }
                    bg={
                      isSelected
                        ? "accent.secondary"
                        : isToday
                          ? "surface.raised"
                          : "transparent"
                    }
                    color={
                      isSelected
                        ? "accentFg.secondary"
                        : day.inVisibleMonth
                          ? "text.primary"
                          : "text.tertiary"
                    }
                    fontSize="xs"
                    fontWeight="900"
                    opacity={day.inVisibleMonth ? 1 : 0.55}
                    _hover={{
                      bg: isSelected
                        ? "accent.secondary"
                        : "surface.raisedHover",
                    }}
                    onClick={() =>
                      selectDate(day.year, day.monthIndex, day.day)
                    }
                  >
                    {day.day}
                  </Button>
                );
              })}
            </SimpleGrid>

            <Box
              border={tokens.borders.hairline}
              borderColor="border.default"
              borderRadius={tokens.radii.input}
              bg="surface.sunken"
              p={2}
            >
              <HStack justify="space-between" mb={1.5}>
                <HStack spacing={1}>
                  <TimeIcon boxSize={3} color="text.secondary" />
                  <Text fontSize="xs" fontWeight="900" color="text.secondary">
                    Time
                  </Text>
                </HStack>
                <Text fontSize="2xs" fontWeight="800" color="text.tertiary">
                  UTC
                </Text>
              </HStack>
              <HStack spacing={2}>
                <Select
                  aria-label={`${label} hour`}
                  value={selectedHour}
                  onChange={(event) => selectHour(Number(event.target.value))}
                  size="sm"
                  h="34px"
                  fontFamily="mono"
                  fontSize="sm"
                  fontWeight="800"
                >
                  {HOURS.map((hour) => (
                    <option key={hour} value={hour}>
                      {pad2(hour)}
                    </option>
                  ))}
                </Select>
                <Text fontWeight="900" color="text.secondary">
                  :
                </Text>
                <Select
                  aria-label={`${label} minute`}
                  value={selectedMinute}
                  onChange={(event) => selectMinute(Number(event.target.value))}
                  size="sm"
                  h="34px"
                  fontFamily="mono"
                  fontSize="sm"
                  fontWeight="800"
                >
                  {MINUTES.map((minute) => (
                    <option key={minute} value={minute}>
                      {pad2(minute)}
                    </option>
                  ))}
                </Select>
              </HStack>
            </Box>

              <Button size="sm" variant="ghost" alignSelf="flex-start" onClick={selectToday}>
                Use today
              </Button>
            </VStack>
          </DrawerBody>
          <DrawerFooter px={4} pb="calc(16px + env(safe-area-inset-bottom, 0px))">
            <Button w="full" variant="primary" onClick={onClose}>
              Done
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
