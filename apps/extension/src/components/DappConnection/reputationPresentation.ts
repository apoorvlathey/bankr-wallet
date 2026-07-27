import type { DappConnectionReputation } from "@/chrome/dapp/reputationModel";

export interface DappReputationPresentation {
  tone: "success" | "warning" | "error";
  title: string;
  description?: string;
  requiresAcknowledgement: boolean;
}

export function buildDappReputationPresentation(
  reputation: DappConnectionReputation,
): DappReputationPresentation {
  switch (reputation.status) {
    case "recognized":
      return reputation.source === "walletchan"
        ? {
            tone: "success",
            title: "Verified domain",
            requiresAcknowledgement: false,
          }
        : {
            tone: "success",
            title: "Listed on DeFiLlama",
            requiresAcknowledgement: false,
          };
    case "danger":
      return {
        tone: "error",
        title: "Reported phishing site",
        description:
          "This domain appears on our phishing blocklist. Connecting may put your assets at risk.",
        requiresAcknowledgement: true,
      };
    case "suspicious":
      return {
        tone: "error",
        title: "Possible lookalike site",
        description: reputation.matchedHostname
          ? `This domain closely resembles ${reputation.matchedHostname}. Check every character before continuing.`
          : "This domain resembles a commonly impersonated Web3 site. Check every character before continuing.",
        requiresAcknowledgement: true,
      };
    case "unverified":
      return reputation.reason === "check-unavailable"
        ? {
            tone: "warning",
            title: "WalletChan couldn't verify this site",
            description: "The reputation check is unavailable. Verify the URL before connecting.",
            requiresAcknowledgement: false,
          }
        : {
            tone: "warning",
            title: "Site not listed",
            description:
              "This site isn't listed in our trusted directory. Verify the URL before connecting.",
            requiresAcknowledgement: false,
          };
  }
}
