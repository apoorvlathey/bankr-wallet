import { useState } from "react";
import { IconButton } from "@chakra-ui/react";
import { CopyIcon, CheckIcon } from "@chakra-ui/icons";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <IconButton
      aria-label="Copy"
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      size="xs"
      variant="ghost"
      color={copied ? "bauhaus.yellow" : "text.secondary"}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
    />
  );
}
