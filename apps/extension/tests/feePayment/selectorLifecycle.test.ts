import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../src/components/FeePaymentSelector.tsx", import.meta.url),
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
