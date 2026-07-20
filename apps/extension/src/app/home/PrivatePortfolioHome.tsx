import { useState, type ReactNode } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { LockIcon, RepeatIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import type { Account } from "@/chrome/types";
import PortfolioChart from "@/components/PortfolioChart";
import PrivateHomeActions from "@/components/PrivateHomeActions";
import { ShieldedEthRow } from "@/components/Portfolio/Holdings/ShieldedEthRow";
import TxStatusList from "@/components/TxStatusList";
import { ListSurface } from "@/components/ui";
import { useShieldInitialization } from "@/components/Shield/hooks/useShieldInitialization";
import { useShieldOperations } from "@/components/Shield/hooks/useShieldOperations";
import { formatShieldWei } from "@/components/Shield/model/shieldQuote";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { usePortfolioValueVisibility } from "./usePortfolioValueVisibility";

interface PrivatePortfolioHomeProps {
  accounts: Account[];
  modeToggle: ReactNode;
  onShield: () => void;
  onUnshield: () => void;
  onSend: () => void;
  onTransactionClick: (tx: CompletedTransaction) => void;
  activeTab: "assets" | "activity";
  onTabChange: (tab: "assets" | "activity") => void;
}

export default function PrivatePortfolioHome({
  accounts,
  modeToggle,
  onShield,
  onUnshield,
  onSend,
  onTransactionClick,
  activeTab,
  onTabChange,
}: PrivatePortfolioHomeProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const { hideValue, toggleHideValue } = usePortfolioValueVisibility();
  const { initialization, retry } = useShieldInitialization();
  const shield = useShieldOperations();
  const displayedValue = hoveredValue ?? shield.series.totalValueUsd ?? 0;
  const isLoading = initialization.status === "loading" || shield.loading;

  return (
    <VStack align="stretch" spacing={3}>
      <Box px={1}>
        <HStack justify="space-between" align="center" spacing={3}>
          <HStack spacing={1.5} minW={0}>
            <LockIcon boxSize="12px" color="accent.highlight" />
            <Text fontSize="sm" color="fg.secondary" fontWeight="500">
              Private balance
            </Text>
          </HStack>
          {modeToggle}
        </HStack>
          <HStack mt={1} spacing={2} align="center">
            {isLoading ? (
              <Skeleton h="34px" w="152px" />
            ) : (
              <Text
                fontSize="3xl"
                lineHeight="1.15"
                fontWeight="700"
                letterSpacing="-0.03em"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatUsd(displayedValue, { hide: hideValue })}
              </Text>
            )}
            <IconButton
              aria-label={hideValue ? "Show private balance" : "Hide private balance"}
              icon={hideValue ? <ViewOffIcon /> : <ViewIcon />}
              variant="ghost"
              size="sm"
              color="fg.secondary"
              onClick={toggleHideValue}
            />
          </HStack>
          <VStack mt={2} align="start" spacing={0.5} sx={{ fontVariantNumeric: "tabular-nums" }}>
            <Text fontSize="xs" color="fg.secondary">
              <Text as="span" color="fg.primary" fontWeight="600">
                {hideValue ? "••••" : `${formatShieldWei(shield.portfolio.readyBalanceWei)} ETH`}
              </Text>{" "}
              shielded
            </Text>
            <Text
              fontSize="xs"
              color={shield.portfolio.pendingBalanceWei > 0n ? "accent.highlight" : "fg.muted"}
            >
              <Text as="span" fontWeight="600">
                {hideValue ? "••••" : `${formatShieldWei(shield.portfolio.pendingBalanceWei)} ETH`}
              </Text>{" "}
              processing
            </Text>
          </VStack>
      </Box>

      <PortfolioChart
        address="privacy-pools"
        snapshots={shield.series.snapshots}
        hideValue={hideValue}
        onHoverValueChange={setHoveredValue}
      />

      <PrivateHomeActions
        onShield={onShield}
        onUnshield={onUnshield}
        onSend={onSend}
      />

      {initialization.status === "action-required" && (
        <HStack
          role="alert"
          px={3}
          py={2.5}
          spacing={2.5}
          borderWidth="1px"
          borderColor="status.warning.border"
          borderRadius="md"
          bg="status.warning.tint"
        >
          <Box flex={1} minW={0}>
            <Text fontSize="sm" fontWeight="700" color="status.warning.fg">
              Private balance unavailable
            </Text>
            <Text fontSize="xs" color="fg.secondary" noOfLines={2}>
              {initialization.error}
            </Text>
          </Box>
          <IconButton
            aria-label="Retry private balance"
            icon={<RepeatIcon />}
            size="sm"
            variant="ghost"
            onClick={retry}
          />
        </HStack>
      )}

      <HStack
        role="tablist"
        aria-label="Private portfolio sections"
        spacing={0}
        borderBottomWidth="1px"
        borderColor="border.subtle"
        px={1}
      >
        {(["assets", "activity"] as const).map((item) => {
          const selected = activeTab === item;
          return (
            <Button
              key={item}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              variant="ghost"
              flex={1}
              minH="44px"
              h="44px"
              borderRadius={0}
              color={selected ? "fg.primary" : "fg.secondary"}
              position="relative"
              textTransform="capitalize"
              _after={{
                content: '""',
                position: "absolute",
                left: "50%",
                bottom: "-1px",
                w: selected ? "28px" : 0,
                h: "3px",
                bg: "accent.highlight",
                borderTopRadius: "full",
                transform: "translateX(-50%)",
                transition: "width 150ms cubic-bezier(0.2, 0.6, 0.2, 1)",
              }}
              onClick={() => onTabChange(item)}
            >
              {item}
            </Button>
          );
        })}
      </HStack>

      <Box role="tabpanel">
        {activeTab === "assets" ? (
          <ListSurface aria-label="Private assets">
            <ShieldedEthRow
              portfolio={shield.portfolio}
              hideValue={hideValue}
              onAction={(action) => {
                if (action === "send") onSend();
                else if (action === "unshield") onUnshield();
                else if (action === "shield") onShield();
                else onTabChange("activity");
              }}
            />
          </ListSurface>
        ) : (
          <TxStatusList
            accounts={accounts}
            hideHeader
            hideCard
            scope="private"
            privateSendOperations={shield.withdrawals}
            onSelectTx={onTransactionClick}
          />
        )}
      </Box>
    </VStack>
  );
}
