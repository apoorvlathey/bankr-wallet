import type {
  DescriptorKind,
  Erc7730Descriptor,
} from "@/lib/clearSigning/types";

export interface GetDescriptorMessage {
  type: "GET_CLEAR_SIGNING_DESCRIPTOR";
  chainId: number;
  address: string;
  kind: DescriptorKind;
  selector?: string;
  formatKey?: string;
}

export interface GetDescriptorResponse {
  descriptor: Erc7730Descriptor | null;
  enabled: boolean;
}

export interface DescriptorLookup {
  chainId: number;
  address: string;
  kind: DescriptorKind;
  selector?: string;
  formatKey?: string;
}

export interface ClearSigningTxLike {
  to?: string;
  data?: string;
  value?: string;
}
