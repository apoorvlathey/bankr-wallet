import { Icon, type IconProps } from "@chakra-ui/react";
import { AddIcon, RepeatIcon, ViewOffIcon } from "@chakra-ui/icons";
import {
  ActionSheet,
  type ActionSheetChoice,
  type ActionSheetProps,
} from "@/components/ui";

interface PortfolioOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  finalFocusRef?: ActionSheetProps["finalFocusRef"];
  isRefreshing: boolean;
  onRefresh: () => void;
  onAddToken: () => void;
  onHideTokens?: () => void;
  unifyBalances: boolean;
  onUnifyBalancesChange: (next: boolean) => void;
}

const UnifyBalancesIcon = (props: IconProps) => (
  <Icon viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path
      d="M4 6h2.5c4.5 0 4.5 6 9 6H20M4 18h2.5c4.5 0 4.5-6 9-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="m17 9 3 3-3 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

export function PortfolioOptionsSheet({
  isOpen,
  onClose,
  finalFocusRef,
  isRefreshing,
  onRefresh,
  onAddToken,
  onHideTokens,
  unifyBalances,
  onUnifyBalancesChange,
}: PortfolioOptionsSheetProps) {
  const choices: ActionSheetChoice[] = [
    {
      id: "refresh",
      label: "Refresh portfolio",
      icon: <RepeatIcon boxSize="18px" />,
      isDisabled: isRefreshing,
    },
    {
      id: "unify-balances",
      label: "Unify Balances",
      icon: <UnifyBalancesIcon boxSize="18px" />,
      isSelected: unifyBalances,
      selectionVariant: "indicator-only",
    },
    {
      id: "add-token",
      label: "Add custom token",
      icon: <AddIcon boxSize="16px" />,
    },
    ...(onHideTokens
      ? [{
          id: "hide-tokens",
          label: "Hide tokens",
          icon: <ViewOffIcon boxSize="18px" />,
        }]
      : []),
  ];

  return (
    <ActionSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Portfolio options"
      choices={choices}
      onSelect={(choiceId) => {
        if (choiceId === "refresh") onRefresh();
        else if (choiceId === "unify-balances") {
          onUnifyBalancesChange(!unifyBalances);
        } else if (choiceId === "add-token") onAddToken();
        else if (choiceId === "hide-tokens") onHideTokens?.();
      }}
      finalFocusRef={finalFocusRef}
    />
  );
}
