import { ERC7715_SUPPORTED_RULE_TYPES } from "./permissionTypes";
import {
  assertOnlyKeys,
  assertSafeTimestamp,
  isObject,
} from "./validationPrimitives";

export type RuleSummary = {
  expiry: number | null;
};

const SUPPORTED_RULE_TYPES_SET = new Set<string>(ERC7715_SUPPORTED_RULE_TYPES);

export function validateErc7715Rules(
  rules: unknown,
  requestIndex: number,
): RuleSummary {
  if (rules === undefined) return { expiry: null };
  if (!Array.isArray(rules)) {
    throw new Error(`Permission request ${requestIndex} has invalid rules`);
  }

  let expiry: number | null = null;
  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const [ruleIndex, rule] of rules.entries()) {
    if (!isObject(rule) || typeof rule.type !== "string") {
      throw new Error(
        `Permission request ${requestIndex} has invalid rule ${ruleIndex}`,
      );
    }
    assertOnlyKeys(rule, ["type", "data"], `Rule ${ruleIndex}`);

    if (!SUPPORTED_RULE_TYPES_SET.has(rule.type)) {
      throw new Error(`Rule type '${rule.type}' is not enabled`);
    }
    if (rule.type === "expiry") {
      if (expiry !== null) {
        throw new Error(`Permission request ${requestIndex} repeats expiry rule`);
      }
      const data = isObject(rule.data) ? rule.data : null;
      if (!data) {
        throw new Error(
          `Permission request ${requestIndex} has invalid expiry rule`,
        );
      }
      assertOnlyKeys(data, ["timestamp"], `Rule ${ruleIndex} data`);
      const timestamp = assertSafeTimestamp(
        data.timestamp,
        `Permission request ${requestIndex} expiry`,
      );
      if (timestamp <= nowSeconds) {
        throw new Error(
          `Permission request ${requestIndex} expiry is in the past`,
        );
      }
      expiry = timestamp;
    }
  }

  return { expiry };
}
