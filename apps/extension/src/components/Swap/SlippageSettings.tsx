import { useRef, useState } from "react";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { SLIPPAGE_PRESETS } from "@/chrome/swapApi";
import { useTheme } from "@/theme";

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
}

export default function SlippageSettings({
  slippageBps,
  onSlippageChange,
}: SlippageSettingsProps) {
  const { tokens } = useTheme();
  const sheet = useDisclosure();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [customValue, setCustomValue] = useState("");

  const displayPercent = (slippageBps / 100).toFixed(
    slippageBps % 100 === 0 ? 0 : 1,
  );
  const isHighRisk = slippageBps > 1000;

  const handlePresetClick = (bps: number) => {
    onSlippageChange(bps);
    setCustomValue((bps / 100).toString());
  };

  const handleCustomChange = (value: string) => {
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    setCustomValue(value);
    const amount = Number.parseFloat(value);
    if (Number.isFinite(amount) && amount > 0 && amount <= 50) {
      onSlippageChange(Math.round(amount * 100));
    }
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        aria-label={`Slippage settings, currently ${displayPercent}%`}
        variant="ghost"
        size="sm"
        minH="32px"
        px={2}
        color="fg.secondary"
        fontSize="xs"
        fontWeight="600"
        rightIcon={<GearIcon boxSize={3.5} />}
        onClick={() => {
          setCustomValue((slippageBps / 100).toString());
          sheet.onOpen();
        }}
      >
        Slippage {displayPercent}%
      </Button>

      <Drawer
        isOpen={sheet.isOpen}
        onClose={sheet.onClose}
        placement="bottom"
        finalFocusRef={triggerRef}
        initialFocusRef={inputRef}
        returnFocusOnClose
      >
        <DrawerOverlay />
        <DrawerContent
          borderTop={tokens.borders.thin}
          borderColor="border.default"
          borderTopRadius={tokens.radii.modal}
        >
          <DrawerCloseButton aria-label="Close slippage settings" boxSize="44px" />
          <DrawerHeader px={4} pt={5} pb={1} pr={16}>
            <Text as="h2" fontSize="lg">Slippage tolerance</Text>
          </DrawerHeader>
          <DrawerBody px={4} pt={2}>
            <Text color="fg.secondary" fontSize="sm" lineHeight="1.45" mb={4}>
              Your swap can complete at this percentage away from the quoted price.
            </Text>
            <VStack align="stretch" spacing={4}>
              <HStack spacing={2}>
                {SLIPPAGE_PRESETS.map((bps) => {
                  const isSelected = slippageBps === bps;
                  return (
                    <Button
                      key={bps}
                      type="button"
                      flex={1}
                      variant={isSelected ? "brand" : "outline"}
                      aria-pressed={isSelected}
                      onClick={() => handlePresetClick(bps)}
                    >
                      {bps / 100}%
                    </Button>
                  );
                })}
              </HStack>

              <FormControl isInvalid={isHighRisk}>
                <FormLabel>Custom tolerance</FormLabel>
                <InputGroup>
                  <Input
                    ref={inputRef}
                    inputMode="decimal"
                    value={customValue}
                    onChange={(event) => handleCustomChange(event.target.value)}
                    aria-describedby="slippage-guidance"
                  />
                  <InputRightElement color="fg.secondary">%</InputRightElement>
                </InputGroup>
                <FormHelperText
                  id="slippage-guidance"
                  color={isHighRisk ? "status.error.fg" : "fg.secondary"}
                >
                  {isHighRisk
                    ? "High tolerance increases front-running and unfavorable price risk."
                    : "Choose between 0.01% and 50%."}
                </FormHelperText>
              </FormControl>
            </VStack>
          </DrawerBody>
          <DrawerFooter px={4} pb="calc(16px + env(safe-area-inset-bottom, 0px))">
            <Button w="full" variant="brand" onClick={sheet.onClose}>
              Done
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
