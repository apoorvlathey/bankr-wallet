import { Grid } from "@chakra-ui/react";

import {
  HomeQuickActionButton,
  HomeSendIcon,
  HomeUnshieldIcon,
} from "@/components/shared/HomeQuickActionButton";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";

interface PrivateHomeActionsProps {
  onShield: () => void;
  onUnshield: () => void;
  onSend: () => void;
}

export default function PrivateHomeActions({
  onShield,
  onUnshield,
  onSend,
}: PrivateHomeActionsProps) {
  const actions = [
    { id: "shield", label: "Shield", icon: <PrivacyShieldIcon />, onClick: onShield },
    { id: "unshield", label: "Unshield", icon: <HomeUnshieldIcon />, onClick: onUnshield },
    { id: "send", label: "Send", icon: <HomeSendIcon />, onClick: onSend },
  ] as const;

  return (
    <Grid
      as="nav"
      aria-label="Private wallet actions"
      templateColumns="repeat(3, minmax(0, 88px))"
      justifyContent="space-between"
      w="100%"
      maxW="320px"
      mx="auto"
    >
      {actions.map((action) => (
        <HomeQuickActionButton
          key={action.id}
          label={action.label}
          icon={action.icon}
          onClick={action.onClick}
        />
      ))}
    </Grid>
  );
}
