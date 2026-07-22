import type { RefObject } from "react";
import { Icon } from "@chakra-ui/react";

import { ActionSheet } from "@/components/ui";

type WithdrawalMethod = "relay" | "direct";
type WithdrawalMethodChoice = WithdrawalMethod | "public";

const LUCIDE_ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  boxSize: "20px",
};

// Lucide v0.460.0 RadioTower, Fuel, and ShieldOff (ISC). Kept local so the
// extension does not pull in a package for three static action-sheet glyphs.
const RadioTowerIcon = () => (
  <Icon {...LUCIDE_ICON_PROPS}>
    <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9" />
    <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" />
    <circle cx="12" cy="9" r="2" />
    <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47" />
    <path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1" />
    <path d="M9.5 18h5" />
    <path d="m8 22 4-11 4 11" />
  </Icon>
);

const FuelIcon = () => (
  <Icon {...LUCIDE_ICON_PROPS}>
    <line x1="3" x2="15" y1="22" y2="22" />
    <line x1="4" x2="14" y1="9" y2="9" />
    <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
    <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
  </Icon>
);

const ShieldOffIcon = () => (
  <Icon {...LUCIDE_ICON_PROPS}>
    <path d="m2 2 20 20" />
    <path d="M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71" />
    <path d="M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264" />
  </Icon>
);

export default function WithdrawalMethodSheet({
  isOpen,
  onClose,
  finalFocusRef,
  method,
  publicWithdrawAvailable,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  finalFocusRef: RefObject<HTMLButtonElement>;
  method: WithdrawalMethod;
  publicWithdrawAvailable: boolean;
  onSelect: (method: WithdrawalMethodChoice) => void;
}) {
  return (
    <ActionSheet
      isOpen={isOpen}
      onClose={onClose}
      finalFocusRef={finalFocusRef}
      title="Withdrawal method"
      description="Choose how this Shielded ETH leaves Privacy Pools."
      choices={[
        {
          id: "relay",
          label: "Private relay",
          description: "Relay pays gas · fee deducted · stronger privacy",
          icon: <RadioTowerIcon />,
          isSelected: method === "relay",
        },
        {
          id: "direct",
          label: "Receiver pays gas",
          description: "Withdrawal · can be partial · receiver submits publicly",
          icon: <FuelIcon />,
          isSelected: method === "direct",
        },
        ...(publicWithdrawAvailable ? [{
          id: "public",
          label: "Public withdraw",
          description: "Ragequit · exits whole deposit · publicly links depositor",
          icon: <ShieldOffIcon />,
          isSelected: false,
        }] : []),
      ]}
      onSelect={(choice) => {
        onSelect(choice === "public"
          ? "public"
          : choice === "direct" ? "direct" : "relay");
        onClose();
      }}
    />
  );
}
