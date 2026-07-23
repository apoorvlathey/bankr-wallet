import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSwapSource = (file: string) =>
  readFile(new URL(`../../src/components/Swap/${file}`, import.meta.url), "utf8");

test("Swap uses a compact amber wallet-sized intent form", async () => {
  const [form, sell, buy, controls, confirmation, multiGas] = await Promise.all([
    readSwapSource("SwapFormScreen.tsx"),
    readSwapSource("SellTokenCard.tsx"),
    readSwapSource("BuyTokenCard.tsx"),
    readSwapSource("SwapTokenControls.tsx"),
    readSwapSource("SwapConfirmation.tsx"),
    readFile(
      new URL("../../src/components/MultiTxGasEstimateDisplay.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(form, /<Box position="relative">[\s\S]*?<SellTokenCard[\s\S]*?<BuyTokenCard/u);
  assert.match(form, /variant="brand"[\s\S]*?Review bridge[\s\S]*?Review swap/u);
  assert.match(form, /bg="accent\.highlight"[\s\S]*?aria-label="Swap direction"|aria-label="Swap direction"[\s\S]*?bg="accent\.highlight"/u);
  assert.match(form, /aria-label="Swap direction"[\s\S]*?minW="46px"[\s\S]*?w="46px"/u);
  assert.match(
    form,
    /"&:not\(:disabled\):hover svg": \{[\s\S]*?transform: "rotate\(180deg\)"/u,
  );
  assert.match(form, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.doesNotMatch(form, /_hover=\{\{[\s\S]*?transform: "translateY\(-1px\)"/u);
  assert.match(form, /title="Swap or Bridge"/u);
  assert.match(sell, /<SliderFilledTrack bg="accent\.highlight" \/>/u);
  assert.match(sell, /boxSize: "18px"[\s\S]*?borderRadius: "5px"/u);
  assert.match(sell, /boxSize="24px"/u);
  assert.match(sell, /px=\{3\}[\s\S]*?pt=\{3\}[\s\S]*?pb=\{5\}/u);
  assert.match(sell, /<SwapChainTrigger[\s\S]*?<SwapTokenTrigger[\s\S]*?<InputGroup isolation="isolate">/u);
  assert.match(sell, /You pay on/u);
  assert.match(sell, /modeSwitchLabel[\s\S]*?onClick=\{onToggleMode\}[\s\S]*?MAX[\s\S]*?Balance/u);
  assert.match(sell, /Balance[\s\S]*?\{" · "\}[\s\S]*?formatUsd/u);
  assert.doesNotMatch(sell, /rightIcon=\{<SwapArrowIcon/u);
  assert.match(buy, /<SwapChainTrigger[\s\S]*?<SwapTokenTrigger[\s\S]*?<InputGroup position="relative">/u);
  assert.match(buy, /You get on/u);
  assert.match(buy, /px=\{3\}[\s\S]*?pt=\{5\}[\s\S]*?pb=\{3\}/u);
  assert.match(buy, /readOnly[\s\S]*?color="fg\.primary"[\s\S]*?_readOnly=\{\{ color: "fg\.primary" \}\}/u);
  assert.match(buy, /<InputRightElement[\s\S]*?formatUsd\(outputUsd\)/u);
  assert.match(buy, /quoteLoading && !unifiedBuyAmount[\s\S]*?left="50%"[\s\S]*?transform="translate\(-50%, -50%\)"/u);
  assert.match(form, /_disabled=\{\{[\s\S]*?bg: "surface\.raised"[\s\S]*?_hover:/u);
  assert.match(form, /onClick=\{props\.onFlip\}[\s\S]*?isDisabled=\{props\.isSubmitting\}/u);
  assert.doesNotMatch(form, /isDisabled=\{!props\.buyTokenInfo\}/u);
  assert.match(controls, /getResolvedChainById\(chainId, networksInfo\)/u);
  assert.match(controls, /export function SwapChainTrigger/u);
  assert.match(controls, /minW="80px"[\s\S]*?maxW="full"[\s\S]*?flex="0 1 auto"/u);
  assert.doesNotMatch(controls, /maxW="110px"/u);
  assert.match(controls, /export function SwapTokenTrigger/u);
  assert.match(controls, /token\?\.symbol \|\| "Select"/u);
  assert.match(sell, /<HStack minW=\{0\} flex="1 1 auto" spacing=\{1\}>/u);
  assert.match(buy, /<HStack minW=\{0\} flex="1 1 auto" spacing=\{1\}>/u);
  assert.match(
    confirmation,
    /<AppHeader[\s\S]*?title=\{titleLabel\}[\s\S]*?onBack=\{onCancel\}[\s\S]*?isBackDisabled=\{isSubmitting\}/u,
  );
  assert.match(confirmation, /isBridge \? "Bridge Overview" : "Swap Overview"/u);
  assert.match(confirmation, /as="h2"[\s\S]*?\{overviewLabel\}[\s\S]*?Swap summary card/u);
  assert.doesNotMatch(confirmation, /Confirmation banner/u);
  assert.match(confirmation, /You get \(est\.\)/u);
  assert.match(confirmation, /<Button[\s\S]*?variant="brand"[\s\S]*?\{titleLabel\}/u);
  assert.match(confirmation, /<StickyActionBar/u);
  assert.match(confirmation, /<SwapDecisionSummary/u);
  assert.match(confirmation, /const \[transactionsExpanded, setTransactionsExpanded\] = useState\(false\)/u);
  assert.match(
    confirmation,
    /aria-controls="swap-transactions"[\s\S]*?<Collapse[\s\S]*?id="swap-transactions"[\s\S]*?in=\{transactionsExpanded\}/u,
  );
  assert.match(
    confirmation,
    /px=\{3\}[\s\S]*?pt="clamp\(24px, min\(12vh, 24vw\), 96px\)"[\s\S]*?pb=\{3\}/u,
  );
  assert.doesNotMatch(confirmation, />\s*ATOMIC\s*</u);
  assert.doesNotMatch(confirmation, />\s*SEQUENTIAL\s*</u);
  assert.match(
    confirmation,
    /<RequestChainContext chainId=\{chainId\} chainName=\{chainName\} showPreposition=\{false\} \/>/u,
  );
  assert.doesNotMatch(confirmation, /bg="whiteAlpha\.900"/u);
  assert.match(
    confirmation,
    /bg=\{isDarkTheme \? "surface\.raisedHover" : accent\}[\s\S]*?color=\{isDarkTheme \? "accent\.highlight" : accentFg\}/u,
  );
  assert.match(multiGas, /import \{ GasFeePopover \} from "@\/components\/GasEstimate\/GasFeePopover"/u);
  assert.match(multiGas, /<GasFeePopover[\s\S]*?fallbackContent=/u);
  assert.doesNotMatch(multiGas, /import \{ GasFeeTrigger \}/u);
  assert.match(
    multiGas,
    /if \(isLocalSigningAccount\) \{[\s\S]*?setPassthroughEstimates\(passthrough\)[\s\S]*?setEditedGasLimits/u,
  );
  assert.doesNotMatch(multiGas, /if \(isLocalSigningAccount && batchedTx\)/u);
});

test("view-only Swap stages review and gates execution on the selected developer RPC", async () => {
  const [view, preparation, confirmation, policy] = await Promise.all([
    readSwapSource("SwapView.tsx"),
    readSwapSource("usePreparedSwap.ts"),
    readSwapSource("SwapConfirmation.tsx"),
    readSwapSource("useImpersonatedSwapPolicy.ts"),
  ]);

  assert.doesNotMatch(view, /accountType !== "impersonator"/u);
  assert.doesNotMatch(preparation, /accountType === "impersonator"/u);
  assert.match(view, /useImpersonatedSwapPolicy/u);
  assert.match(
    view,
    /accountType === "impersonator"[\s\S]*?!canSendImpersonatedTransaction/u,
  );
  assert.match(
    confirmation,
    /isConfirmDisabled \|\|[\s\S]*?feePaymentToken === "native" && !isNativeGasValid[\s\S]*?feePaymentToken !== "native"/u,
  );
  assert.match(policy, /allowsImpersonatedTransactions\(chainId, rpcUrl\)/u);
});

test("Swap keeps custom slippage behind a compact settings control", async () => {
  const [section, settings, sameChainQuote, bridgeQuote, preference] = await Promise.all([
    readSwapSource("SwapQuoteSection.tsx"),
    readSwapSource("SlippageSettings.tsx"),
    readSwapSource("SwapQuoteDisplay.tsx"),
    readSwapSource("BridgeQuoteDisplay.tsx"),
    readSwapSource("useSwapSlippage.ts"),
  ]);

  assert.match(section, /Finding the best route/u);
  assert.match(section, /<SlippageSettings/u);
  assert.match(settings, /Slippage \{displayPercent\}%/u);
  assert.match(settings, /Custom tolerance/u);
  assert.match(settings, /SLIPPAGE_PRESETS\.map/u);
  assert.match(settings, /variant=\{isSelected \? "brand" : "outline"\}/u);
  assert.match(sameChainQuote, /<Collapse in=\{isOpen\}/u);
  assert.match(sameChainQuote, /Minimum received/u);
  assert.match(sameChainQuote, /gridTemplateColumns="max-content minmax\(0, 1fr\) 16px"/u);
  assert.doesNotMatch(sameChainQuote, /noOfLines=\{1\}/u);
  assert.match(bridgeQuote, /<Collapse in=\{isOpen\}/u);
  assert.match(bridgeQuote, /Minimum received/u);
  assert.match(bridgeQuote, /formatQuoteSummaryAmount\(minBuyAmount\)/u);
  assert.match(preference, /useState\(DEFAULT_SLIPPAGE_BPS\)/u);
  assert.match(
    preference,
    /chrome\.storage\.sync\.get\("swapSlippageBps"[\s\S]*?setSlippageBpsState\(stored\)/u,
  );
});

test("Swap separates the shared searchable network browser from token discovery", async () => {
  const [picker, view] = await Promise.all([
    readSwapSource("BridgeChainTokenPickerScreen.tsx"),
    readSwapSource("SwapView.tsx"),
  ]);

  assert.match(picker, /panel === "chains"/u);
  assert.match(picker, /<NetworkSelectorScreen/u);
  assert.match(picker, /isFunded: fundedChainIds\.has\(chain\.chainId\)/u);
  assert.doesNotMatch(picker, />\s*Popular on \{currentChainName\}\s*</u);
  assert.match(picker, /aria-label=\{`Popular tokens on \$\{currentChainName\}`\}/u);
  assert.match(
    picker,
    /label="Search tokens"[\s\S]*?labelTrailing=\{[\s\S]*?chainId=\{currentChainId\}[\s\S]*?\{currentChainName\}/u,
  );
  assert.match(picker, /Your tokens on \$\{currentChainName\}/u);
  assert.match(
    picker,
    /label=\{`Tokens on \$\{currentChainName\}`\}[\s\S]*?_notFirst=\{\{ mt: 3 \}\}/u,
  );
  assert.match(picker, /chainTotals\.get\(chain\.chainId\)/u);
  assert.match(picker, /h="32px"[\s\S]*?<TokenLogo[\s\S]*?size="16px"/u);
  assert.match(
    picker,
    /borderColor=\{isSelected \? "border\.focus"[\s\S]*?color=\{isSelected \? "accent\.secondary"/u,
  );
  assert.match(view, /panel: "chains"/u);
  assert.match(view, /panel: "tokens"/u);
});

test("Swap initializes a generic entry from the cached top portfolio token", async () => {
  const [view, data, utils] = await Promise.all([
    readSwapSource("SwapView.tsx"),
    readSwapSource("useSellTokenData.ts"),
    readSwapSource("swapViewUtils.ts"),
  ]);

  assert.match(data, /selectPortfolioTokensForInteraction\(/u);
  assert.match(data, /setHoldingsAllChains\(interactiveTokens\)/u);
  assert.match(data, /enrich: false/u);
  assert.match(view, /pickDefaultSwapSellToken\(holdingsAllChains\)/u);
  assert.match(view, /setSellChainId\(cachedTopToken\.chainId\)/u);
  assert.match(view, /setBuyChainId\(cachedTopToken\.chainId\)/u);
  assert.match(view, /resolveInitialSwapChainId\(initialChainId, initialSellToken\)/u);
  assert.match(utils, /initialSellToken &&[\s\S]*?SWAP_SUPPORTED_CHAIN_IDS\.has\(initialSellToken\.chainId\)/u);
  assert.doesNotMatch(view, /if \(!buyToken\.buyTokenInfo \|\| !buyToken\.buyTokenAddress\) return/u);
  assert.match(view, /buildFlippedSellToken\(\{/u);
  assert.match(utils, /if \(!args\.buyTokenInfo \|\| !address\) return null/u);
  assert.match(view, /setSellChainId\(buyChainId\)[\s\S]*?setBuyChainId\(previousSellChainId\)/u);
});

test("asset-row Swap renders its sell token before portfolio hydration", async () => {
  const data = await readSwapSource("useSellTokenData.ts");

  assert.match(
    data,
    /const \[sellToken, setSellToken\] = useState<PortfolioToken \| null>\(\s*initialSellToken \?\? null,\s*\)/u,
  );
  assert.match(data, /const initialSellTokenRef = useRef\(initialSellToken\)/u);
  assert.doesNotMatch(
    data,
    /const \[sellToken, setSellToken\] = useState<PortfolioToken \| null>\(null\)/u,
  );
});
