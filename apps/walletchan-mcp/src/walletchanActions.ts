import type { RuntimeChainSummary } from "./chains.js";
import {
  PERMIT2_ADDRESS,
  decodePermit2AllowanceResult,
  decodeUintResult,
  encodeErc20Allowance,
  encodeErc20Approve,
  encodePermit2Allowance,
  encodePermit2Approve,
  normalizeAddress,
  normalizeHexQuantity,
} from "./evmEncoding.js";
import type { WalletCall } from "./rpcClient.js";
import { WalletChanRpcClient } from "./rpcClient.js";
import {
  assertSwapIsUsable,
  filterPortfolio,
  firstAddress,
  numberInput,
  optionalString,
  requiredString,
  resolveDestinationChain,
  selectBridgeRoute,
  summarizeSwapQuote,
  swapWarnings,
} from "./walletchanActionHelpers.js";
import {
  WalletChanTokenResolver,
  amountFromInput,
  type ResolvedToken,
} from "./walletchanTokens.js";
import type {
  PortfolioResponse,
  WalletChanApiClient,
} from "./walletchanApi.js";

const DEFAULT_SLIPPAGE_BPS = 500;

export class WalletChanActionBuilder {
  private readonly tokens: WalletChanTokenResolver;

  constructor(
    private readonly api: WalletChanApiClient,
    private readonly rpc: WalletChanRpcClient,
  ) {
    this.tokens = new WalletChanTokenResolver(api);
  }

  async portfolio(input: Record<string, unknown>): Promise<PortfolioResponse> {
    const address = optionalString(input.address) || await this.rpc.resolveFrom(optionalString(input.from));
    const portfolio = await this.api.portfolio(address);
    return filterPortfolio(portfolio, input);
  }

  async swapPrice(input: Record<string, unknown>): Promise<unknown> {
    const { chain, from, sellToken, buyToken, amountWei, slippageBps, recipient } =
      await this.resolveSwapInputs(input, false);
    const price = await this.api.swapPrice({
      chainId: chain.chainId,
      sellToken: sellToken.apiAddress,
      buyToken: buyToken.apiAddress,
      sellAmount: amountWei,
      taker: from,
      recipient,
      slippageBps,
    });
    return {
      kind: "swap_price",
      chain,
      from,
      sellToken,
      buyToken,
      sellAmountWei: amountWei,
      slippageBps,
      price,
      warnings: swapWarnings(price),
    };
  }

  async prepareSwap(input: Record<string, unknown>): Promise<PreparedWalletAction> {
    const { chain, from, sellToken, buyToken, amountWei, slippageBps, recipient } =
      await this.resolveSwapInputs(input, true);
    if (!from) throw new Error("swap requires an approved WalletChan sender");

    const price = await this.api.swapPrice({
      chainId: chain.chainId,
      sellToken: sellToken.apiAddress,
      buyToken: buyToken.apiAddress,
      sellAmount: amountWei,
      taker: from,
      recipient,
      slippageBps,
    });
    assertSwapIsUsable(price, input.allowWarnings === true);

    const quote = await this.api.swapQuote({
      chainId: chain.chainId,
      sellToken: sellToken.apiAddress,
      buyToken: buyToken.apiAddress,
      sellAmount: amountWei,
      taker: from,
      recipient,
      slippageBps,
    });
    assertSwapIsUsable(quote, input.allowWarnings === true);

    if (!quote.transaction?.to || !quote.transaction.data) {
      throw new Error("WalletChan swap quote did not return executable transaction data");
    }

    const calls: WalletCall[] = [];
    if (!sellToken.native) {
      const allowanceSpender =
        firstAddress(price.issues?.allowance?.spender, quote.issues?.allowance?.spender, quote.allowanceTarget);
      if (allowanceSpender) {
        const currentAllowance = await this.erc20Allowance(chain, sellToken.address, from, allowanceSpender);
        if (BigInt(currentAllowance) < BigInt(amountWei)) {
          calls.push({
            to: sellToken.address as `0x${string}`,
            data: encodeErc20Approve(allowanceSpender, amountWei),
            value: "0x0",
          });
        }
      }

      const permit2 = price.issues?.permit2Approval ?? quote.issues?.permit2Approval;
      const permit2Spender = firstAddress(permit2?.spender);
      const permit2Token = firstAddress(permit2?.token);
      const permit2Contract = allowanceSpender ?? PERMIT2_ADDRESS;
      if (permit2Spender && permit2Token) {
        const permit2Allowance = await this.permit2Allowance(
          chain,
          from,
          permit2Token,
          permit2Spender,
          permit2Contract,
        );
        const now = Math.floor(Date.now() / 1000);
        if (BigInt(permit2Allowance.amount) < BigInt(amountWei) || permit2Allowance.expiration < now) {
          calls.push({
            to: permit2Contract as `0x${string}`,
            data: encodePermit2Approve(permit2Token, permit2Spender, amountWei),
            value: "0x0",
          });
        }
      }
    }

    calls.push({
      to: normalizeAddress(quote.transaction.to, "swap transaction to"),
      data: normalizeHexQuantity(quote.transaction.data, "swap transaction data"),
      value: normalizeHexQuantity(quote.transaction.value ?? "0", "swap transaction value"),
    });

    return {
      kind: "swap",
      chain,
      from,
      calls,
      warnings: swapWarnings(quote),
      metadata: {
        sellToken,
        buyToken,
        sellAmountWei: amountWei,
        slippageBps,
        quote: summarizeSwapQuote(quote),
      },
      raw: { price, quote },
    };
  }

  async bridgeQuote(input: Record<string, unknown>): Promise<unknown> {
    const params = await this.resolveBridgeInputs(input);
    const quote = await this.api.bridgeQuote(params.apiParams);
    return {
      kind: "bridge_quote",
      ...params.publicParams,
      quote,
      selectedRoute: selectBridgeRoute(quote),
    };
  }

  async prepareBridge(input: Record<string, unknown>): Promise<PreparedWalletAction> {
    const params = await this.resolveBridgeInputs(input);
    const quote = await this.api.bridgeQuote(params.apiParams);
    const selection = selectBridgeRoute(quote);
    if (!selection) {
      throw new Error("WalletChan bridge quote did not return an executable manual or auto-tx route");
    }

    let txData = selection.route.txData;
    let approvalData = selection.route.approvalData ?? null;
    if (selection.source === "manual") {
      if (!selection.route.quoteId) {
        throw new Error("WalletChan bridge manual route did not include quoteId");
      }
      const built = await this.api.bridgeBuildTx(selection.route.quoteId);
      txData = built.result?.txData;
      approvalData = built.result?.approvalData ?? null;
    }
    if (!txData?.to || !txData.data) {
      throw new Error("WalletChan bridge route did not return executable transaction data");
    }

    const calls: WalletCall[] = [];
    if (approvalData && !params.inputToken.native) {
      const allowance = await this.erc20Allowance(
        params.chain,
        approvalData.tokenAddress,
        params.from,
        approvalData.spenderAddress,
      );
      if (BigInt(allowance) < BigInt(approvalData.amount)) {
        calls.push({
          to: normalizeAddress(approvalData.tokenAddress, "bridge approval token"),
          data: encodeErc20Approve(approvalData.spenderAddress, approvalData.amount),
          value: "0x0",
        });
      }
    }

    calls.push({
      to: normalizeAddress(txData.to, "bridge transaction to"),
      data: normalizeHexQuantity(txData.data, "bridge transaction data"),
      value: normalizeHexQuantity(txData.value ?? "0", "bridge transaction value"),
    });

    return {
      kind: "bridge",
      chain: params.chain,
      from: params.from,
      calls,
      warnings: [],
      metadata: {
        ...params.publicParams,
        selectedRoute: selection,
      },
      raw: { quote },
    };
  }

  async bridgeStatus(input: Record<string, unknown>): Promise<unknown> {
    const requestHash = optionalString(input.requestHash);
    const txHash = optionalString(input.txHash);
    if (!requestHash && !txHash) {
      throw new Error("get_bridge_status requires requestHash or txHash");
    }
    return this.api.bridgeStatus({ requestHash, txHash });
  }

  private async resolveSwapInputs(input: Record<string, unknown>, requireFrom: boolean): Promise<{
    chain: RuntimeChainSummary;
    from?: string;
    sellToken: ResolvedToken;
    buyToken: ResolvedToken;
    amountWei: string;
    slippageBps: number;
    recipient?: string;
  }> {
    const chain = await this.rpc.resolveChain(input.chain);
    const from = requireFrom || input.from || input.taker
      ? await this.rpc.resolveFrom(optionalString(input.from) || optionalString(input.taker))
      : optionalString(input.taker);
    const [sellToken, buyToken] = await Promise.all([
      this.tokens.resolveSwapToken(chain.chainId, requiredString(input.sellToken, "swap requires sellToken")),
      this.tokens.resolveSwapToken(chain.chainId, requiredString(input.buyToken, "swap requires buyToken")),
    ]);
    const amountWei = amountFromInput(input, "sellAmount", "sellAmountWei", sellToken);
    const recipient = optionalString(input.recipient);
    if (recipient) normalizeAddress(recipient, "recipient");
    return {
      chain,
      from,
      sellToken,
      buyToken,
      amountWei,
      slippageBps: numberInput(input.slippageBps, DEFAULT_SLIPPAGE_BPS),
      recipient,
    };
  }

  private async resolveBridgeInputs(input: Record<string, unknown>): Promise<{
    chain: RuntimeChainSummary;
    from: string;
    inputToken: ResolvedToken;
    outputToken: ResolvedToken;
    apiParams: {
      userAddress: string;
      receiverAddress: string;
      originChainId: number;
      destinationChainId: number;
      inputToken: string;
      outputToken: string;
      inputAmount: string;
      slippage?: number;
    };
    publicParams: Record<string, unknown>;
  }> {
    const chain = await this.rpc.resolveChain(input.originChain ?? input.chain);
    const destinationChainId = resolveDestinationChain(input.destinationChainId ?? input.destinationChain);
    if (!Number.isInteger(destinationChainId) || destinationChainId <= 0) {
      throw new Error("bridge requires destinationChainId");
    }
    const from = await this.rpc.resolveFrom(optionalString(input.from) || optionalString(input.userAddress));
    const receiverAddress = optionalString(input.receiverAddress) || from;
    normalizeAddress(receiverAddress, "receiverAddress");

    const [inputToken, outputToken] = await Promise.all([
      this.tokens.resolveBridgeToken(chain.chainId, requiredString(input.inputToken, "bridge requires inputToken")),
      this.tokens.resolveBridgeToken(destinationChainId, requiredString(input.outputToken, "bridge requires outputToken")),
    ]);
    const inputAmount = amountFromInput(input, "inputAmount", "inputAmountWei", inputToken);
    const slippage = input.slippage === undefined
      ? numberInput(input.slippageBps, DEFAULT_SLIPPAGE_BPS) / 100
      : numberInput(input.slippage, 0.5);

    const apiParams = {
      userAddress: from,
      receiverAddress,
      originChainId: chain.chainId,
      destinationChainId,
      inputToken: inputToken.bridgeAddress,
      outputToken: outputToken.bridgeAddress,
      inputAmount,
      slippage,
    };
    return {
      chain,
      from,
      inputToken,
      outputToken,
      apiParams,
      publicParams: {
        from,
        receiverAddress,
        originChainId: chain.chainId,
        destinationChainId,
        inputToken,
        outputToken,
        inputAmountWei: inputAmount,
        slippage,
      },
    };
  }

  private async erc20Allowance(
    chain: RuntimeChainSummary,
    token: string,
    owner: string,
    spender: string,
  ): Promise<string> {
    const result = await this.rpc.ethCall({
      chain: chain.chainId,
      to: token,
      data: encodeErc20Allowance(owner, spender),
    });
    return decodeUintResult(result);
  }

  private async permit2Allowance(
    chain: RuntimeChainSummary,
    owner: string,
    token: string,
    spender: string,
    permit2Contract: string,
  ): Promise<{ amount: string; expiration: number; nonce: number }> {
    const result = await this.rpc.ethCall({
      chain: chain.chainId,
      to: permit2Contract,
      data: encodePermit2Allowance(owner, token, spender),
    });
    return decodePermit2AllowanceResult(result);
  }
}

export interface PreparedWalletAction {
  kind: "swap" | "bridge";
  chain: RuntimeChainSummary;
  from: string;
  calls: WalletCall[];
  warnings: string[];
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
}
