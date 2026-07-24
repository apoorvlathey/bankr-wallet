"use client";

import { useState, useRef } from "react";
import {
  HStack,
  Text,
  Input,
  Flex,
  Icon,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { SLIPPAGE_PRESETS } from "../constants";
import { palette } from "../../home-v2/design";

function GearIcon(props: React.ComponentProps<typeof Icon>) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <path
        fill="currentColor"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
      />
    </Icon>
  );
}

interface SlippageSettingsProps {
  slippageBps: number;
  onSlippageChange: (bps: number) => void;
  presets?: number[];
  appearance?: "bauhaus" | "midnight";
}

export function SlippageSettings({
  slippageBps,
  onSlippageChange,
  presets,
  appearance = "bauhaus",
}: SlippageSettingsProps) {
  const isMidnight = appearance === "midnight";
  const { isOpen, onToggle, onClose } = useDisclosure();
  const [customValue, setCustomValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const activePresets = presets ?? SLIPPAGE_PRESETS;
  const isPreset = activePresets.includes(slippageBps);
  const displayPercent = (slippageBps / 100).toFixed(
    slippageBps % 100 === 0 ? 0 : 1
  );

  const handlePresetClick = (bps: number) => {
    onSlippageChange(bps);
    setCustomValue("");
    onClose();
  };

  const handleCustomChange = (val: string) => {
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setCustomValue(val);
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0 && num <= 50) {
        onSlippageChange(Math.round(num * 100));
      }
    }
  };

  return (
    <Popover
      isOpen={isOpen}
      onClose={onClose}
      placement="bottom-end"
      initialFocusRef={inputRef}
    >
      <PopoverTrigger>
        <HStack
          as="button"
          spacing={0.5}
          onClick={onToggle}
          cursor="pointer"
          _hover={{ opacity: 0.7 }}
        >
          <Text
            fontSize="2xs"
            fontWeight="bold"
            color={isMidnight ? palette.faint : "gray.500"}
          >
            {displayPercent}% slippage
          </Text>
          <GearIcon
            boxSize={3}
            color={isMidnight ? palette.faint : "gray.500"}
          />
        </HStack>
      </PopoverTrigger>
      <PopoverContent
        bg={isMidnight ? palette.ink3 : "white"}
        color={isMidnight ? palette.white : undefined}
        border={isMidnight ? "1px solid" : "2px solid"}
        borderColor={
          isMidnight ? "rgba(255,255,255,0.14)" : "bauhaus.border"
        }
        borderRadius={isMidnight ? "12px" : 0}
        boxShadow={
          isMidnight
            ? "0 18px 48px rgba(0,0,0,0.42)"
            : "3px 3px 0px 0px #121212"
        }
        w="200px"
        _focus={{ boxShadow: "3px 3px 0px 0px #121212" }}
      >
        <PopoverBody p={3}>
          <VStack spacing={2} align="stretch">
            {/* Presets */}
            <HStack spacing={1}>
              {activePresets.map((bps) => {
                const pct = bps / 100;
                const isActive = slippageBps === bps;
                return (
                  <Flex
                    key={bps}
                    as="button"
                    flex={1}
                    justify="center"
                    py={1}
                    bg={
                      isMidnight
                        ? isActive
                          ? palette.yellow
                          : palette.ink2
                        : isActive
                          ? "bauhaus.blue"
                          : "gray.100"
                    }
                    color={
                      isMidnight
                        ? isActive
                          ? palette.ink
                          : palette.muted
                        : isActive
                          ? "white"
                          : "bauhaus.foreground"
                    }
                    fontWeight="bold"
                    fontSize="xs"
                    border="1px solid"
                    borderColor={
                      isMidnight
                        ? isActive
                          ? palette.yellow
                          : "rgba(255,255,255,0.10)"
                        : isActive
                          ? "bauhaus.blue"
                          : "gray.200"
                    }
                    borderRadius={isMidnight ? "7px" : 0}
                    _hover={{
                      bg: isMidnight
                        ? isActive
                          ? palette.amberSoft
                          : "rgba(255,255,255,0.10)"
                        : isActive
                          ? "bauhaus.blue"
                          : "gray.200",
                    }}
                    onClick={() => handlePresetClick(bps)}
                  >
                    {pct}%
                  </Flex>
                );
              })}
            </HStack>

            {/* Custom input */}
            <HStack
              border="1px solid"
              borderColor={
                isMidnight
                  ? !isPreset && slippageBps > 0
                    ? palette.yellow
                    : "rgba(255,255,255,0.12)"
                  : !isPreset && slippageBps > 0
                    ? "bauhaus.blue"
                    : "gray.200"
              }
              borderRadius={isMidnight ? "7px" : 0}
              bg={isMidnight ? palette.ink2 : undefined}
              px={2}
              py={1}
              spacing={1}
            >
              <Input
                ref={inputRef}
                placeholder="Custom"
                value={
                  customValue || (slippageBps / 100).toString()
                }
                onChange={(e) => handleCustomChange(e.target.value)}
                border="none"
                _focus={{ boxShadow: "none" }}
                color={isMidnight ? palette.white : undefined}
                _placeholder={isMidnight ? { color: palette.faint } : undefined}
                fontSize="xs"
                fontWeight="bold"
                p={0}
                h="auto"
                flex={1}
              />
              <Text
                fontSize="xs"
                fontWeight="bold"
                color={isMidnight ? palette.faint : "gray.400"}
              >
                %
              </Text>
            </HStack>

            {slippageBps > 1000 && (
              <Text
                fontSize="2xs"
                color={isMidnight ? palette.red : "bauhaus.red"}
                fontWeight="bold"
              >
                High slippage — front-run risk
              </Text>
            )}
          </VStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
