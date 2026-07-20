import { Grid, Icon } from "@chakra-ui/react";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";
import {
  HomeQuickActionButton,
  HomeSendIcon,
} from "@/components/shared/HomeQuickActionButton";

interface HomeQuickActionsProps {
  onSend: () => void;
  onSwap: () => void;
  onShield: () => void;
  onMore: () => void;
  hasConnectedApps?: boolean;
}

const SwapIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M5 8h12m0 0-3-3m3 3-3 3M19 16H7m0 0 3 3m-3-3 3-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

const MoreIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M5 5h5v5H5V5Zm9 0h5v5h-5V5ZM5 14h5v5H5v-5Zm9 0h5v5h-5v-5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </Icon>
);

const actions = [
  { id: "send", label: "Send", icon: <HomeSendIcon /> },
  { id: "swap", label: "Swap", icon: <SwapIcon /> },
  { id: "shield", label: "Shield", icon: <PrivacyShieldIcon /> },
  { id: "more", label: "More", icon: <MoreIcon /> },
] as const;

/** Stable, mobile-style root actions with equal spacing and bounded tap targets. */
export default function HomeQuickActions({
  onSend,
  onSwap,
  onShield,
  onMore,
  hasConnectedApps = false,
}: HomeQuickActionsProps) {
  const handlers = { send: onSend, swap: onSwap, shield: onShield, more: onMore };

  return (
    <Grid
      as="nav"
      aria-label="Wallet actions"
      templateColumns="repeat(4, minmax(0, 1fr))"
      columnGap={{ base: 1, sm: 2 }}
      w="100%"
      maxW="620px"
      mx="auto"
    >
      {actions.map((action) => (
        <HomeQuickActionButton
          key={action.id}
          label={action.label}
          icon={action.icon}
          onClick={handlers[action.id]}
          emphasized={action.id === "swap"}
          accentIcon={action.id !== "more"}
          indicator={action.id === "more" && hasConnectedApps}
          ariaLabel={
            action.id === "more" && hasConnectedApps
              ? "More, connected app active"
              : action.label
          }
        />
      ))}
    </Grid>
  );
}
