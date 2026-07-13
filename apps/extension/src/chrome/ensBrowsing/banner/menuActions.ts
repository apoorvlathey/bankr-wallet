import { currentPagePath } from "./pageState";
import { openGatewayWithBypass } from "./transport";
import type { BannerRefs, BannerTabContext } from "./types";

export function buildHostedGatewayUrl(
  context: BannerTabContext,
  pagePath: string,
): string {
  const current = pagePath || "/";
  const path = current.startsWith("/") ? current : `/${current}`;
  const isWeb3 = context.kind === "web3" && !!context.contractAddress;
  const isGwei = /\.gwei$/i.test(context.ensName);
  return isWeb3 && context.contractAddress
    ? `https://${context.contractAddress}.w3eth.io${path}`
    : isGwei
      ? `https://${context.ensName}.domains${path}`
      : `https://${context.ensName}.limo${path}`;
}

export function wireBannerMenu(
  refs: BannerRefs,
  context: BannerTabContext,
): void {
  const isAddressNavigation = /^0x[a-f0-9]{40}$/i.test(context.ensName);
  const isGwei = /\.gwei$/i.test(context.ensName);
  if (isAddressNavigation || isGwei) {
    refs.historyLink.style.display = "none";
  } else {
    refs.historyLink.href =
      `https://ens.eth.sh/history/${context.ensName.toLowerCase()}`;
  }

  const isWeb3 = context.kind === "web3" && !!context.contractAddress;
  if (isWeb3 || isGwei) {
    const label = refs.openGatewayItem.querySelector("span");
    if (label) {
      label.textContent = isWeb3
        ? "Open on w3eth.io gateway"
        : "Open on gwei.domains gateway";
    }
  }

  const closeMenu = () => refs.menu.classList.remove("open");
  refs.menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    refs.menu.classList.toggle("open");
  });
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  refs.copyItem.addEventListener("click", async () => {
    closeMenu();
    await copyUnderlyingUrl(refs, location.href);
  });
  refs.openGatewayItem.addEventListener("click", () => {
    closeMenu();
    const url = buildHostedGatewayUrl(context, currentPagePath());
    openGatewayWithBypass(url);
  });
}

async function copyUnderlyingUrl(
  refs: BannerRefs,
  url: string,
): Promise<void> {
  const showFeedback = () => {
    refs.copyToast.classList.add("show");
    setTimeout(() => refs.copyToast.classList.remove("show"), 1200);
  };
  try {
    await navigator.clipboard.writeText(url);
    showFeedback();
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body?.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      showFeedback();
    } finally {
      textarea.remove();
    }
  }
}
