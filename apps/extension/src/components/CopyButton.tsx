import { useState } from "react";
import { IconButton } from "@chakra-ui/react";
import { CopyIcon, CheckIcon } from "@chakra-ui/icons";

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <IconButton
      aria-label={label}
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      size="xs"
      minW="24px"
      w="24px"
      h="24px"
      variant="ghost"
      color={copied ? "accent.highlight" : "text.secondary"}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
    />
  );
}
