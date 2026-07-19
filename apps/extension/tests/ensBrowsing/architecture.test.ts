import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as handlerFacade from "../../src/chrome/ensBrowsing/handlers";
import * as messageRoutes from "../../src/chrome/ensBrowsing/messageRoutes";
import * as resolverFacade from "../../src/chrome/ensBrowsing/resolver";
import * as nameResolvers from "../../src/chrome/ensBrowsing/nameResolvers";
import * as erc4804Resolver from "../../src/chrome/ensBrowsing/erc4804Resolver";
import * as senderAuthorization from "../../src/chrome/ensBrowsing/senderAuthorization";

const ENS_ROOT = new URL("../../src/chrome/ensBrowsing/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ENS_ROOT), "utf8");
}

test("stable ENS browsing facades preserve their public function identities", () => {
  assert.equal(
    handlerFacade.handleEnsBrowsingMessage,
    messageRoutes.handleEnsBrowsingMessage,
  );
  assert.equal(
    handlerFacade.isAuthorizedEnsBrowsingSender,
    senderAuthorization.isAuthorizedEnsBrowsingSender,
  );
  assert.equal(resolverFacade.resolveEns, nameResolvers.resolveEns);
  assert.equal(resolverFacade.resolveGwei, nameResolvers.resolveGwei);
  assert.equal(resolverFacade.isGweiName, nameResolvers.isGweiName);
  assert.equal(
    resolverFacade.resolveContractAddress,
    erc4804Resolver.resolveContractAddress,
  );
});

test("facades contain no message, navigation, resolver, or storage policy", async () => {
  for (const path of ["handlers.ts", "resolver.ts"]) {
    const moduleSource = await source(path);
    assert.ok(moduleSource.split("\n").length <= 20, path);
    assert.doesNotMatch(
      moduleSource,
      /\b(?:switch|fetch|chrome\.|createPublicClient)\b/,
    );
  }
});

test("ENS browsing dependencies flow inward without policy cycles", async () => {
  const authorization = await source("senderAuthorization.ts");
  assert.doesNotMatch(
    authorization,
    /from ["']\.\/(?:handlers|messageRoutes|navigation|resolver|nameResolvers|erc4804Resolver)["']/,
  );

  const support = await source("resolverSupport.ts");
  assert.doesNotMatch(
    support,
    /from ["']\.\/(?:resolver|nameResolvers|erc4804Resolver|navigation|messageRoutes)["']/,
  );

  const erc4804 = await source("erc4804Resolver.ts");
  assert.match(erc4804, /from ["']\.\/resolverSupport["']/);
  assert.doesNotMatch(
    erc4804,
    /from ["']\.\/(?:resolver|nameResolvers|navigation|messageRoutes|handlers)["']/,
  );

  const names = await source("nameResolvers.ts");
  assert.match(names, /from ["']\.\/resolverSupport["']/);
  assert.match(names, /from ["']\.\/erc4804Resolver["']/);
  assert.doesNotMatch(
    names,
    /from ["']\.\/(?:resolver|navigation|messageRoutes|handlers)["']/,
  );

  const navigation = await source("navigation.ts");
  assert.match(navigation, /from ["']\.\/resolver["']/);
  assert.doesNotMatch(navigation, /from ["']\.\/messageRoutes["']/);

  const routes = await source("messageRoutes.ts");
  assert.match(routes, /from ["']\.\/senderAuthorization["']/);
  assert.match(routes, /from ["']\.\/navigation["']/);
  assert.ok(
    routes.indexOf("isAuthorizedEnsBrowsingSender(type, sender)") <
      routes.indexOf('message.type === "ens-cache-metadata"'),
    "sender authorization must run before any recognized route",
  );
});

test("extracted ENS browsing modules remain independently auditable", async () => {
  const budgets: Record<string, number> = {
    "senderAuthorization.ts": 140,
    "messageRoutes.ts": 340,
    "navigation.ts": 240,
    "resolverSupport.ts": 120,
    "nameResolvers.ts": 240,
    "erc4804Resolver.ts": 220,
    "contenthashHistory.ts": 220,
  };
  for (const [path, maximumLines] of Object.entries(budgets)) {
    const lines = (await source(path)).split("\n").length;
    assert.ok(lines <= maximumLines, `${path}: ${lines} > ${maximumLines}`);
  }
});
