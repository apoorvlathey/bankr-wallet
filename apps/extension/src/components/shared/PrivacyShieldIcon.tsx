import { Icon, type IconProps } from "@chakra-ui/react";

/** WalletChan's privacy mark, shared by the home action and Shield activity. */
export function PrivacyShieldIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true" {...props}>
      <path
        d="M14 18a2 2 0 0 0-4 0M19 11l-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11M2 11h20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="17"
        cy="18"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="7"
        cy="18"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </Icon>
  );
}
