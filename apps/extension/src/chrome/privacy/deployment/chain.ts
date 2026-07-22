import { mainnet, sepolia } from "viem/chains";

import { PRIVACY_POOLS_DEPLOYMENT } from "./manifest";

export const PRIVACY_POOLS_VIEM_CHAIN =
  PRIVACY_POOLS_DEPLOYMENT.chainId === mainnet.id ? mainnet : sepolia;
