import { SettingsRow } from "./SettingsRow";
import { ShieldIcon } from "./icons";

interface Props {
  disabled: boolean;
  onClick: () => void;
}

export function PrivacyRecoverySettingsRow({ disabled, onClick }: Props) {
  return (
    <SettingsRow
      title="Shield Recovery"
      subtitle={disabled
        ? "Unlock with master password to access"
        : "Back up or restore your Shield phrase"}
      icon={<ShieldIcon boxSize={5} />}
      iconBg="status.warning.tint"
      iconColor="status.warning.emphasis"
      cornerAccent="highlight"
      showChevron={!disabled}
      onClick={onClick}
      disabled={disabled}
    />
  );
}
