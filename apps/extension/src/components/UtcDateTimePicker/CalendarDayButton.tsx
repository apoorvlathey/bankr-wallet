import { Button, Tooltip } from "@chakra-ui/react";

export function CalendarDayButton({
  day,
  inVisibleMonth,
  isSelected,
  isToday,
  isBoundary,
  isDisabled,
  boundaryTooltip,
  borderRadius,
  onSelect,
}: {
  day: number;
  inVisibleMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  isBoundary: boolean;
  isDisabled: boolean;
  boundaryTooltip?: string;
  borderRadius: string | number;
  onSelect: () => void;
}) {
  return (
    <Tooltip
      label={boundaryTooltip}
      isDisabled={!isBoundary}
      hasArrow
      placement="top"
      openDelay={180}
    >
      <Button
        type="button"
        variant="ghost"
        h="30px"
        minW={0}
        p={0}
        position="relative"
        isDisabled={isDisabled}
        borderRadius={borderRadius}
        border="1px solid"
        borderColor={
          isSelected
            ? "accent.highlight"
            : isToday
              ? "border.default"
              : "transparent"
        }
        bg={
          isSelected
            ? "accent.highlight"
            : isToday
              ? "surface.raised"
              : "transparent"
        }
        color={
          isSelected
            ? "accentFg.highlight"
            : inVisibleMonth
              ? "text.primary"
              : "text.tertiary"
        }
        fontSize="xs"
        fontWeight="900"
        opacity={isDisabled ? 0.28 : inVisibleMonth ? 1 : 0.55}
        _after={
          isBoundary
            ? {
                content: '""',
                position: "absolute",
                bottom: "2px",
                left: "50%",
                transform: "translateX(-50%)",
                w: "4px",
                h: "4px",
                borderRadius: "full",
                bg: isSelected ? "accentFg.highlight" : "accent.highlight",
              }
            : undefined
        }
        _hover={{
          bg: isSelected ? "accent.highlight" : "surface.raisedHover",
        }}
        _disabled={{
          opacity: 0.28,
          cursor: "not-allowed",
          bg: "transparent",
          color: "text.tertiary",
        }}
        onClick={onSelect}
      >
        {day}
      </Button>
    </Tooltip>
  );
}
