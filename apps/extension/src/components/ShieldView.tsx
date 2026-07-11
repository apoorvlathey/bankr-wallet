import { AppHeader, AppScreen, ScreenBody } from "@/components/ui";

interface ShieldViewProps {
  onBack: () => void;
}

/** Placeholder destination for WalletChan's upcoming privacy tools. */
export default function ShieldView({ onBack }: ShieldViewProps) {
  return (
    <AppScreen>
      <AppHeader title="Shield" onBack={onBack} />
      <ScreenBody />
    </AppScreen>
  );
}
