import { ponder } from "ponder:registry";
import { coinLaunch } from "../ponder.schema";
import { CoinAbi } from "../abis/CoinAbi";

const BENEFICIARY_0 = "0x21E2ce70511e4FE542a97708e89520471DAa7A66".toLowerCase();
const BENEFICIARY_1 = "0x2Cdd33d6FF2a897180c7F4e5a20F018Bf0c16fD1".toLowerCase();
const BENEFICIARY_3 = "0xF60633D02690e2A15A54AB919925F3d038Df163e".toLowerCase();

// Uniswap V4 PoolManager on Base
const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
// Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, ...)
const INITIALIZE_TOPIC0 =
  "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";

async function handleLockEvent({
  event,
  context,
}: {
  event: any;
  context: any;
}) {
  const { beneficiaries } = event.args;
  const pool = event.args.pool;

  // Must have exactly 4 beneficiaries
  if (beneficiaries.length !== 4) return;

  // Verify the fixed addresses match (case-insensitive)
  if (
    beneficiaries[0].account.toLowerCase() !== BENEFICIARY_0 ||
    beneficiaries[1].account.toLowerCase() !== BENEFICIARY_1 ||
    beneficiaries[3].account.toLowerCase() !== BENEFICIARY_3
  ) {
    return;
  }

  const creatorAddress = beneficiaries[2].account;
  const coinAddress = pool;

  // Extract poolId from the Initialize event in the same transaction.
  // Note: Ponder v0.8+ removed transactionReceipt.logs, so we fetch the
  // receipt via RPC to scan for the PoolManager Initialize log.
  let poolId: `0x${string}` | null = null;
  try {
    const receipt = await context.client.getTransactionReceipt({
      hash: event.transaction.hash,
    });
    const initLog = receipt.logs.find(
      (log: any) =>
        log.address.toLowerCase() === POOL_MANAGER &&
        log.topics[0] === INITIALIZE_TOPIC0
    );
    if (initLog?.topics[1]) {
      poolId = initLog.topics[1] as `0x${string}`;
    }
  } catch (e) {
    console.error(
      `Failed to fetch receipt for poolId extraction (tx: ${event.transaction.hash}):`,
      e
    );
  }

  // Read onchain metadata (single multicall RPC request)
  let name: string | null = null;
  let symbol: string | null = null;
  let tokenURI: string | null = null;

  try {
    const results = await context.client.multicall({
      contracts: [
        { abi: CoinAbi, address: coinAddress, functionName: "name" },
        { abi: CoinAbi, address: coinAddress, functionName: "symbol" },
        { abi: CoinAbi, address: coinAddress, functionName: "tokenURI" },
      ],
    });
    if (results[0].status === "success") name = results[0].result;
    if (results[1].status === "success") symbol = results[1].result;
    if (results[2].status === "success") tokenURI = results[2].result;
  } catch (e) {
    console.error(`Failed to read metadata for ${coinAddress}:`, e);
  }

  await context.db
    .insert(coinLaunch)
    .values({
      id: coinAddress.toLowerCase(),
      coinAddress,
      poolId,
      name,
      symbol,
      tokenURI,
      tweetUrl: null,
      creatorAddress,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoNothing();
}

ponder.on("UniswapV4ScheduledMulticurveInitializer:Lock", handleLockEvent);
ponder.on("DecayMulticurveInitializer:Lock", handleLockEvent);
