import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Box,
  HStack,
  IconButton,
  Skeleton,
  Text,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import { RepeatIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { keyframes } from "@emotion/react";
import NumberFlow, { type Format } from "@number-flow/react";
import PortfolioChart from "@/components/PortfolioChart";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";

interface PortfolioBalanceChartProps {
  address: string;
  totalValueUsd: number;
  loading: boolean;
  hideValue: boolean;
  onToggleHideValue?: () => void;
  onRefresh?: () => void | Promise<void>;
  modeToggle?: ReactNode;
  refreshTrigger: number;
}

const PORTFOLIO_VALUE_FORMAT: Format = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const PORTFOLIO_VALUE_TIMING = {
  duration: 220,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
};

const refreshRotation = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

function PortfolioBalanceChart({
  address,
  totalValueUsd,
  loading,
  hideValue,
  onToggleHideValue,
  onRefresh,
  modeToggle,
  refreshTrigger,
}: PortfolioBalanceChartProps) {
  const [refreshPressNonce, setRefreshPressNonce] = useState(0);
  const [isRefreshAnimating, setIsRefreshAnimating] = useState(false);
  const [hoveredChartValue, setHoveredChartValue] = useState<number | null>(
    null,
  );
  const [balanceMotionDirection, setBalanceMotionDirection] = useState<
    "up" | "down" | null
  >(null);
  const totalValueUsdRef = useRef(totalValueUsd);
  totalValueUsdRef.current = totalValueUsd;
  const displayedBalanceRef = useRef<number | null>(totalValueUsd);
  const balanceTintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const refreshAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (hoveredChartValue === null) {
      displayedBalanceRef.current = totalValueUsd;
    }
  }, [hoveredChartValue, totalValueUsd]);

  const handleChartHoverValueChange = useCallback((value: number | null) => {
    const nextValue = value ?? totalValueUsdRef.current;
    const previousValue =
      displayedBalanceRef.current ?? totalValueUsdRef.current;

    setHoveredChartValue(value);
    displayedBalanceRef.current = nextValue;

    if (nextValue === previousValue) return;
    setBalanceMotionDirection(nextValue > previousValue ? "up" : "down");
    if (balanceTintTimerRef.current) {
      clearTimeout(balanceTintTimerRef.current);
    }
    balanceTintTimerRef.current = setTimeout(() => {
      balanceTintTimerRef.current = null;
      setBalanceMotionDirection(null);
    }, PORTFOLIO_VALUE_TIMING.duration + 80);
  }, []);

  useEffect(
    () => () => {
      if (balanceTintTimerRef.current) {
        clearTimeout(balanceTintTimerRef.current);
      }
      if (refreshAnimationTimerRef.current) {
        clearTimeout(refreshAnimationTimerRef.current);
      }
    },
    [],
  );

  const portfolioDisplayValue = hoveredChartValue ?? totalValueUsd;
  const isBelowDisplayThreshold =
    portfolioDisplayValue > 0 && portfolioDisplayValue < 0.01;
  const hasControls = onToggleHideValue !== undefined && onRefresh !== undefined;

  return (
    <>
      <Box px={1}>
        <HStack justify="space-between" align="center" spacing={3}>
          <Text fontSize="sm" color="fg.secondary" fontWeight="500">
            Portfolio balance
          </Text>
          {modeToggle}
        </HStack>
        <HStack mt={0.5} spacing={2} align="center">
          {loading && !totalValueUsd ? (
            <Skeleton h="34px" w="150px" />
          ) : (
            <Text
              data-testid="portfolio-balance"
              fontSize="3xl"
              lineHeight="1.15"
              fontWeight="700"
              letterSpacing="-0.03em"
              color={
                balanceMotionDirection === "up"
                  ? "status.success.emphasis"
                  : balanceMotionDirection === "down"
                    ? "status.error.emphasis"
                    : "fg.primary"
              }
              transition="color 160ms cubic-bezier(0.23, 1, 0.32, 1)"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              {hideValue ? (
                formatUsdShared(portfolioDisplayValue, { hide: true })
              ) : (
                <NumberFlow
                  value={
                    isBelowDisplayThreshold ? 0.01 : portfolioDisplayValue
                  }
                  locales="en-US"
                  format={PORTFOLIO_VALUE_FORMAT}
                  prefix={isBelowDisplayThreshold ? "<$" : "$"}
                  transformTiming={PORTFOLIO_VALUE_TIMING}
                  spinTiming={PORTFOLIO_VALUE_TIMING}
                  opacityTiming={{ duration: 120, easing: "ease-out" }}
                  willChange
                />
              )}
            </Text>
          )}
          {hasControls && (
            <HStack spacing={0} align="center">
              <IconButton
                aria-label={
                  hideValue
                    ? "Show portfolio values"
                    : "Hide portfolio values"
                }
                icon={hideValue ? <ViewOffIcon /> : <ViewIcon />}
                variant="ghost"
                size="sm"
                minW="32px"
                minH="32px"
                color="fg.secondary"
                onClick={onToggleHideValue}
              />
              <IconButton
                aria-label="Refresh portfolio"
                icon={
                  <RepeatIcon
                    key={refreshPressNonce}
                    animation={
                      isRefreshAnimating
                        ? `${refreshRotation} 520ms cubic-bezier(0.23, 1, 0.32, 1)`
                        : undefined
                    }
                    color={isRefreshAnimating ? "accent.highlight" : "inherit"}
                  />
                }
                variant="ghost"
                size="sm"
                minW="32px"
                minH="32px"
                color="fg.secondary"
                isDisabled={loading}
                onClick={() => {
                  setRefreshPressNonce((nonce) => nonce + 1);
                  if (!prefersReducedMotion) {
                    if (refreshAnimationTimerRef.current) {
                      clearTimeout(refreshAnimationTimerRef.current);
                    }
                    setIsRefreshAnimating(true);
                    refreshAnimationTimerRef.current = setTimeout(() => {
                      refreshAnimationTimerRef.current = null;
                      setIsRefreshAnimating(false);
                    }, 520);
                  }
                  void onRefresh();
                }}
              />
            </HStack>
          )}
        </HStack>
      </Box>

      <PortfolioChart
        address={address}
        hideValue={hideValue}
        refreshTrigger={refreshTrigger}
        onHoverValueChange={handleChartHoverValueChange}
      />
    </>
  );
}

export default memo(PortfolioBalanceChart);
