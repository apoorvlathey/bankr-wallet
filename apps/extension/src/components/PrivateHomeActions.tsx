import { Grid, Icon } from "@chakra-ui/react";

import {
  HomeQuickActionButton,
  HomeUnshieldIcon,
} from "@/components/shared/HomeQuickActionButton";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";

interface PrivateHomeActionsProps {
  onShield: () => void;
  onUnshield: () => void;
  onDeposits: () => void;
}

const StatusIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M5 6h14M5 12h14M5 18h9"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Icon>
);

export default function PrivateHomeActions({
  onShield,
  onUnshield,
  onDeposits,
}: PrivateHomeActionsProps) {
  const actions = [
    { id: "shield", label: "Shield", icon: <PrivacyShieldIcon />, onClick: onShield },
    { id: "unshield", label: "Unshield", icon: <HomeUnshieldIcon />, onClick: onUnshield },
    { id: "deposits", label: "Deposits", icon: <StatusIcon />, onClick: onDeposits },
  ] as const;

  return (
    <Grid
      as="nav"
      aria-label="Private wallet actions"
      templateColumns="repeat(3, minmax(0, 1fr))"
      columnGap={{ base: 1, sm: 2 }}
      w={{ base: "100%", sm: "75%" }}
      maxW="465px"
      mx="auto"
    >
      {actions.map((action) => (
        <HomeQuickActionButton
          key={action.id}
          label={action.label}
          icon={action.icon}
          onClick={action.onClick}
          accentIcon={action.id === "shield" || action.id === "unshield"}
          mutedIcon={action.id === "deposits"}
        />
      ))}
    </Grid>
  );
}
