import { Box } from "@chakra-ui/react";

import type { Account } from "@/chrome/types";
import AccountPickerScreen from "@/components/AccountPicker/AccountPickerScreen";

export interface AccountsSettingsProps {
  accounts: Account[];
  activeAccount: Account | null;
  onBack: () => void;
  onAddAccount: () => void;
  onAccountSettings: (account: Account) => void;
  onAccountsReordered?: (accounts: Account[]) => void;
}

export default function AccountsSettings({
  accounts,
  activeAccount,
  onBack,
  onAddAccount,
  onAccountSettings,
  onAccountsReordered,
}: AccountsSettingsProps) {
  return (
    <Box
      flex="1 1 auto"
      minH={0}
      mx={-4}
      my={-4}
      w="calc(100% + 2rem)"
      h="calc(100% + 2rem)"
    >
      <AccountPickerScreen
        accounts={accounts}
        activeAccount={activeAccount}
        title="Accounts"
        mode="manage"
        onBack={onBack}
        onAddAccount={onAddAccount}
        onAccountSettings={onAccountSettings}
        onAccountsReordered={onAccountsReordered}
      />
    </Box>
  );
}
