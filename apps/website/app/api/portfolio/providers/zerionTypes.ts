export interface ZerionQuantity {
  int?: string;
  decimals?: number;
  float?: number;
  numeric?: string;
}

export interface ZerionImplementation {
  chain_id?: string;
  decimals?: number;
  address?: string | null;
}

export interface ZerionFungibleInfo {
  name?: string;
  symbol?: string;
  icon?: { url?: string | null } | null;
  implementations?: ZerionImplementation[];
  market_data?: {
    price?: number | null;
  };
}

export interface ZerionPositionAttributes {
  name?: string;
  quantity?: ZerionQuantity | null;
  parent?: string | null;
  protocol?: string | null;
  protocol_module?: string | null;
  position_type?: string | null;
  group_id?: string | null;
  value?: number | null;
  price?: number | null;
  fungible_info?: ZerionFungibleInfo | null;
  application_metadata?: {
    name?: string | null;
    icon?: { url?: string | null } | null;
    url?: string | null;
  } | null;
}

export interface ZerionPosition {
  id: string;
  type?: string;
  attributes?: ZerionPositionAttributes;
  relationships?: {
    chain?: {
      data?: {
        id?: string;
      } | null;
    };
    dapp?: {
      data?: {
        id?: string;
      } | null;
    };
  };
}

export interface ZerionPositionsResponse {
  links?: {
    next?: string | null;
  };
  data?: ZerionPosition[];
  errors?: Array<{ title?: string; detail?: string }>;
}

export interface ZerionChain {
  id: string;
  attributes?: {
    external_id?: string | number | null;
  };
}

export interface ZerionChainsResponse {
  links?: {
    next?: string | null;
  };
  data?: ZerionChain[];
}
