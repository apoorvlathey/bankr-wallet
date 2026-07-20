const ETHERSCAN_URL = "https://etherscan.io";

export interface AccountDashboardLink {
  name: string;
  iconSrc: string;
  href: string;
}

export function getDefaultAccountExplorerUrl(address: string): string {
  return `${ETHERSCAN_URL}/address/${address}`;
}

export function getAccountDashboardLinks(
  address: string,
): AccountDashboardLink[] {
  const encodedAddress = encodeURIComponent(address);

  return [
    {
      name: "DeBank",
      iconSrc: "/debank-icon.ico",
      href: `https://debank.com/profile/${encodedAddress}`,
    },
    {
      name: "Nansen",
      iconSrc: "/nansen-icon.png",
      href: `https://app.nansen.ai/address/${encodedAddress}`,
    },
    {
      name: "Octav",
      iconSrc: "/octav-icon.png",
      href: `https://pro.octav.fi/?addresses=${encodedAddress}`,
    },
    {
      name: "Zerion",
      iconSrc: "/zerion-icon.png",
      href: `https://app.zerion.io/${encodedAddress}/overview`,
    },
    {
      name: "Blockscan",
      iconSrc: "/blockscan-icon.png",
      href: `https://blockscan.com/address/${encodedAddress}`,
    },
  ];
}
