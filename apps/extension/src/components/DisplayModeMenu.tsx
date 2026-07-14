import { useRef } from "react";
import { Icon, IconButton, useDisclosure } from "@chakra-ui/react";
import { ExternalLinkIcon, HamburgerIcon } from "@chakra-ui/icons";
import { ActionSheet } from "@/components/ui";

interface DisplayModeMenuProps {
  sidePanelSupported: boolean;
  sidePanelMode: boolean;
  isFullscreenTab?: boolean;
  onToggleSidePanel: () => void;
  onOpenFullscreen: () => void;
}

const SidePanelIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      fill="currentColor"
      d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 2v14h5V5h-5zM4 5v14h10V5H4z"
    />
  </Icon>
);

export default function DisplayModeMenu({
  sidePanelSupported,
  sidePanelMode,
  isFullscreenTab = false,
  onToggleSidePanel,
  onOpenFullscreen,
}: DisplayModeMenuProps) {
  const options = useDisclosure();
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const choices = [
    ...(sidePanelSupported && !isFullscreenTab
      ? [
          {
            id: "panel",
            label: sidePanelMode ? "Switch to Popup" : "Switch to Side Panel",
            icon: <SidePanelIcon />,
          },
        ]
      : []),
    ...(!isFullscreenTab
      ? [
          {
            id: "fullscreen",
            label: "Open in fullscreen tab",
            icon: <ExternalLinkIcon aria-hidden="true" />,
          },
        ]
      : []),
  ];

  if (choices.length === 0) return null;

  return (
    <>
      <IconButton
        ref={optionsButtonRef}
        aria-label="Quick actions"
        icon={<HamburgerIcon />}
        variant="ghost"
        minW="44px"
        h="44px"
        onClick={options.onOpen}
      />
      <ActionSheet
        isOpen={options.isOpen}
        onClose={options.onClose}
        finalFocusRef={optionsButtonRef}
        title="Quick Actions"
        choices={choices}
        onSelect={(id) => {
          if (id === "panel") onToggleSidePanel();
          if (id === "fullscreen") onOpenFullscreen();
        }}
      />
    </>
  );
}
