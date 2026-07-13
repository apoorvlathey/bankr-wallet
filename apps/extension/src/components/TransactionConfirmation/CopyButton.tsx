import { useState } from "react";
import { CheckIcon, CopyIcon } from "@chakra-ui/icons";
import { IconButton, Tooltip } from "@chakra-ui/react";

interface CopyButtonProps {
  value: string;
  light?: boolean;
  label?: string;
}

export function CopyButton({ value, light, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be unavailable in restricted browser contexts.
    }
  };

  const button = (
    <IconButton
      aria-label={label || "Copy"}
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      size="xs"
      variant="ghost"
      color={
        copied
          ? "accent.highlight"
          : light
            ? "whiteAlpha.800"
            : "text.secondary"
      }
      onClick={handleCopy}
      _hover={{
        color: light ? "white" : "accent.secondary",
        bg: light ? "whiteAlpha.200" : "bg.muted",
      }}
    />
  );

  return label ? (
    <Tooltip label={label} fontSize="xs" hasArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
