import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";
import { SettingsRow } from "./SettingsRow";

interface Props {
  disabled: boolean;
  onClick: () => void;
}

export function PrivacyRecoverySettingsRow({ disabled, onClick }: Props) {
  return (
    <SettingsRow
      title="Privacy Pools recovery"
      subtitle={disabled
        ? "Unlock with master password to access"
        : "Back up or restore your Privacy Pools phrase"}
      icon={<PrivacyShieldIcon boxSize={5} />}
      iconBg="status.warning.tint"
      iconColor="status.warning.emphasis"
      iconHoverColor="status.warning.emphasis"
      cornerAccent="highlight"
      showChevron={!disabled}
      onClick={onClick}
      disabled={disabled}
    />
  );
}
