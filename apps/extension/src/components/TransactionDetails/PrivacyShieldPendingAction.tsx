import { Center, Button } from "@chakra-ui/react";

export default function PrivacyShieldPendingAction({
  onUnshield,
}: {
  onUnshield: () => void;
}) {
  return (
    <Center>
      <Button
        size="sm"
        variant="secondary"
        color="fg.secondary"
        onClick={onUnshield}
      >
        Cancel Shielding and Withdraw?
      </Button>
    </Center>
  );
}
