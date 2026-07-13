import { pendingTxCallbacks } from "./pendingRequests";
import type { ProviderRequestContext } from "./requestContext";

export function requestTransaction(
  context: ProviderRequestContext,
  params: any[],
): Promise<string> {
  const transaction = params[0] as {
    to?: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pendingTxCallbacks.set(id, { resolve, reject });
    window.postMessage(
      {
        type: "i_sendTransaction",
        msg: {
          id,
          from: context.address,
          to: transaction.to || null,
          data: transaction.data || "0x",
          value: transaction.value || "0x0",
          chainId: context.chainId,
          ...(transaction.gas ? { gas: transaction.gas } : {}),
          ...(transaction.gasPrice ? { gasPrice: transaction.gasPrice } : {}),
          ...(transaction.maxFeePerGas
            ? { maxFeePerGas: transaction.maxFeePerGas }
            : {}),
          ...(transaction.maxPriorityFeePerGas
            ? { maxPriorityFeePerGas: transaction.maxPriorityFeePerGas }
            : {}),
        },
      },
      "*",
    );
  });
}
