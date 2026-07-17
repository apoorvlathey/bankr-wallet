import { AddAccountTypeGrid, type AccountType } from "@/components/AddAccountTypeGrid";
import { AppHeader, AppScreen, ScreenBody, ScreenSection } from "@/components/ui";

interface AddAccountTypeSelectionScreenProps {
  hasBankrAccount: boolean;
  onBack: () => void;
  onSelect: (type: AccountType) => void;
}

export function AddAccountTypeSelectionScreen({
  hasBankrAccount,
  onBack,
  onSelect,
}: AddAccountTypeSelectionScreenProps) {
  return (
    <AppScreen>
      <AppHeader title="Add account" onBack={onBack} />
      <ScreenBody pt={5}>
        <ScreenSection title="Choose an account type">
          <AddAccountTypeGrid
            hasBankrAccount={hasBankrAccount}
            onSelect={onSelect}
          />
        </ScreenSection>
      </ScreenBody>
    </AppScreen>
  );
}
