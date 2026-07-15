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
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  TimeIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";

import { useTheme } from "@/theme";
import { CalendarDayButton } from "./UtcDateTimePicker/CalendarDayButton";
import {
  buildCalendarDays,
  formatUtcDisplay,
  getCalendarDayBoundaryState,
  HOURS,
  MINUTES,
  MONTHS,
  pad2,
  shiftMonth,
  toUtcParts,
  toUtcSeconds,
  visibleMonthFromSeconds,
  WEEKDAYS,
  type UtcDateBoundaryDirection,
  type UtcParts,
} from "./UtcDateTimePicker/dateTimeModel";

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
  dateBoundaries = [],
  error,
  label,
  onChange,
}: {
  valueSeconds: number | null;
  disabled: boolean;
  dateBoundaries?: Array<{
    seconds: number;
    direction: UtcDateBoundaryDirection;
    label: string;
  }>;
  error?: string | null;
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
          aria-invalid={Boolean(error)}
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
          bg="transparent"
          boxShadow="none"
          pointerEvents="none"
        >
          <Box
            position="relative"
            display="flex"
            flexDirection="column"
            w="full"
            maxW="480px"
            maxH="92dvh"
            mx="auto"
            bg="surface.raised"
            borderTop={tokens.borders.thin}
            borderColor="border.default"
            borderTopRadius={tokens.radii.modal}
            overflow="hidden"
            pointerEvents="auto"
          >
            <DrawerCloseButton aria-label="Close date and time picker" boxSize="44px" />
            <DrawerHeader px={4} pt={5} pb={2} pr={16}>
              <Text as="h2" fontSize="lg">{label}</Text>
            </DrawerHeader>
            <DrawerBody px={4} py={2} overflowY="auto">
              <VStack align="stretch" spacing={3} maxW="320px" w="full" mx="auto">
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

            {error && (
              <HStack
                role="alert"
                align="flex-start"
                spacing={2}
                bg="status.error.bg"
                color="status.error.fg"
                borderWidth="1px"
                borderColor="status.error.border"
                borderRadius="md"
                px={3}
                py={2.5}
              >
                <WarningTwoIcon boxSize="14px" mt="2px" flexShrink={0} />
                <Text fontSize="xs" fontWeight="600" lineHeight="1.45">
                  {error}
                </Text>
              </HStack>
            )}

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
                const boundaryStates = dateBoundaries.map((boundary) => ({
                  boundary,
                  state: getCalendarDayBoundaryState(
                    day,
                    boundary.seconds,
                    boundary.direction,
                  ),
                }));
                const matchingBoundaries = boundaryStates.filter(
                  ({ state }) => state.isBoundary,
                );
                const boundaryTooltip = matchingBoundaries
                  .map(({ boundary }) => {
                    const parts = toUtcParts(boundary.seconds);
                    return `${boundary.label} · ${pad2(parts.hour)}:${pad2(
                      parts.minute,
                    )} UTC`;
                  })
                  .join(" • ");

                return (
                  <CalendarDayButton
                    key={dayKey}
                    day={day.day}
                    inVisibleMonth={day.inVisibleMonth}
                    isSelected={isSelected}
                    isToday={isToday}
                    isBoundary={matchingBoundaries.length > 0}
                    isDisabled={boundaryStates.some(
                      ({ state }) => state.isDisabled,
                    )}
                    boundaryTooltip={boundaryTooltip || undefined}
                    borderRadius={tokens.radii.input}
                    onSelect={() =>
                      selectDate(day.year, day.monthIndex, day.day)
                    }
                  />
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

              <Button size="sm" variant="ghost" alignSelf="flex-end" onClick={selectToday}>
                Use today
              </Button>
              </VStack>
            </DrawerBody>
            <DrawerFooter px={4} pb="calc(16px + env(safe-area-inset-bottom, 0px))">
              <Button w="full" variant="brand" onClick={onClose}>
                Done
              </Button>
            </DrawerFooter>
          </Box>
        </DrawerContent>
      </Drawer>
    </>
  );
}
