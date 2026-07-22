import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../src/components/FeePaymentSelector.tsx", import.meta.url),
  "utf8",
);
const capabilitiesSource = readFileSync(
  new URL("../../src/chrome/feePayment/capabilities.ts", import.meta.url),
  "utf8",
);
const transactionSummarySource = readFileSync(
  new URL(
    "../../src/components/TransactionConfirmation/TransactionDecisionSummary.tsx",
    import.meta.url,
  ),
  "utf8",
);
const batchSummarySource = readFileSync(
  new URL(
    "../../src/components/BatchConfirmation/BatchDecisionSummary.tsx",
    import.meta.url,
  ),
  "utf8",
);
const safeSummarySource = readFileSync(
  new URL(
    "../../src/components/SafeApprovals/SafeProposalDecisionSummary.tsx",
    import.meta.url,
  ),
  "utf8",
);
const internalTransferSource = readFileSync(
  new URL("../../src/chrome/transactions/internalTransfer.ts", import.meta.url),
  "utf8",
);
const swapExecutionSource = readFileSync(
  new URL("../../src/components/Swap/executePreparedSwap.ts", import.meta.url),
  "utf8",
);

test("fee quote loading has a bounded renderer deadline and explicit retry", () => {
  assert.match(source, /QUOTE_REQUEST_TIMEOUT_MS = 30_000/u);
  assert.match(source, /gas quote timed out/u);
  assert.match(source, /quoteRequestSequence\.current \+= 1/u);
  assert.ok(source.includes("{displayedQuoteError}"));
  assert.ok(source.includes(">\n            Retry\n          </Button>"));
});

test("failed quotes are not automatically retried", () => {
  assert.match(
    source,
    /isTokenPayment[\s\S]*!quote[\s\S]*!quoteLoading[\s\S]*!quoteError[\s\S]*!quoteRequestStarted\.current/u,
  );
  assert.match(source, /chrome\.runtime\.lastError/u);
  assert.doesNotMatch(source, /setTimeout\(\s*requestQuote/u);
  assert.match(source, /gas quote expired/u);
});

test("a completed parent-owned quote survives selector rerenders", () => {
  assert.match(source, /quote: FeePaymentQuoteSummary \| null/u);
  assert.match(source, /const maximumTokenCost = quote\?\.maximumTokenCost/u);
  assert.match(source, /const quoteRequestStarted = useRef\(Boolean\(quote\)\)/u);
  assert.doesNotMatch(
    source,
    /useEffect\(\(\) => \{[\s\S]{0,400}onQuoteChange\(null\)[\s\S]{0,100}\}, \[cancelQuoteRequest/u,
  );
});

test("token estimation uses the shared loader and catalog logos", () => {
  assert.match(source, /<ShapesLoader size="6px" \/>/u);
  assert.match(source, />\s*Estimating Fees\s*</u);
  assert.match(source, /icon: tokenLogo\(option, "24px"\)/u);
  assert.match(source, /logoUrl=\{option\.logoUrl\}/u);
  assert.match(source, /w="full"[\s\S]*justify="center"[\s\S]*Estimating Fees/u);
  assert.match(source, /formatTokenAmount\(option\.balance, option\.decimals\)/u);
  assert.doesNotMatch(source, /Quote calculated after selection/u);
  assert.doesNotMatch(source, />\s*Balance \{formatTokenAmount\(tokenBalance/u);
});

test("fee-option discovery cannot spin forever", () => {
  assert.match(source, /OPTIONS_REQUEST_TIMEOUT_MS = 10_000/u);
  assert.match(source, /setLoading\(false\)/u);
});

test("single, batch, Safe, and internal-send reviews share the fee-option boundary", () => {
  assert.equal(
    [...capabilitiesSource.matchAll(/return getOptionsForRequest\(/gu)].length,
    3,
  );
  assert.match(
    capabilitiesSource,
    /options\.push\(\.\.\.buildFundedFeePaymentTokenOptions\(/u,
  );
  assert.match(transactionSummarySource, /<FeePaymentSelector/u);
  assert.match(batchSummarySource, /<FeePaymentSelector/u);
  assert.match(batchSummarySource, /requestKind="batch"/u);
  assert.match(safeSummarySource, /<FeePaymentSelector/u);
  assert.match(safeSummarySource, /requestKind="safe"/u);
  assert.match(safeSummarySource, /accountId=\{selectedAccount\.id\}/u);
  assert.match(internalTransferSource, /pinnedTxRequest\(activeAccount,/u);
  assert.match(internalTransferSource, /savePendingTxRequest\(pendingRequest\)/u);
});

test("in-wallet swap execution stays native-only and exposes no fee-token picker", () => {
  assert.doesNotMatch(swapExecutionSource, /FeePaymentSelector/u);
  assert.doesNotMatch(swapExecutionSource, /feePaymentToken/u);
  assert.doesNotMatch(swapExecutionSource, /prepareFeePaymentQuote/u);
});
