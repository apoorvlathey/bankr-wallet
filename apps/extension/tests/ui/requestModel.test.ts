import assert from "node:assert/strict";
import test from "node:test";
import {
  getCombinedRequests,
  type CombinedRequest,
} from "../../src/app/requestModel";
import type { CrossDappBatch } from "../../src/chrome/crossDappBatch/storage";
import type { PendingBatchTxRequest } from "../../src/chrome/erc5792Types";
import type { PendingErc7715PermissionRequest } from "../../src/chrome/pendingErc7715PermissionStorage";
import type { PendingSignatureRequest } from "../../src/chrome/requests/pendingSignatureStorage";
import type { PendingTxRequest } from "../../src/chrome/requests/pendingTxStorage";

const withTimestamp = <T>(id: string, timestamp: number) =>
  ({ id, timestamp } as unknown as T);

test("combined pending requests keep one chronological order across families", () => {
  const requests = getCombinedRequests(
    [withTimestamp<PendingTxRequest>("tx-late", 40)],
    [withTimestamp<PendingSignatureRequest>("sig-first", 10)],
    [withTimestamp<PendingBatchTxRequest>("batch-third", 30)],
    null,
    [withTimestamp<PendingErc7715PermissionRequest>("permission-second", 20)],
  );

  assert.deepEqual(
    requests.map((item) => [item.type, item.request.id]),
    [
      ["sig", "sig-first"],
      ["permission", "permission-second"],
      ["batch", "batch-third"],
      ["tx", "tx-late"],
    ],
  );
});

test("a populated cross-dapp batch keeps the dedicated first carousel slot", () => {
  const crossDappBatch = {
    id: "cross-dapp",
    entries: [{ id: "entry" }],
    createdAt: 100,
  } as unknown as CrossDappBatch;

  const requests = getCombinedRequests(
    [withTimestamp<PendingTxRequest>("tx", 1)],
    [],
    [],
    crossDappBatch,
  );

  assert.equal(requests[0]?.type, "crossDappBatch");
  assert.equal(
    (requests[0] as Extract<CombinedRequest, { type: "crossDappBatch" }>).request.id,
    "cross-dapp",
  );
  assert.equal(requests[1]?.type, "tx");
});

test("an empty cross-dapp batch is omitted", () => {
  const crossDappBatch = {
    id: "empty",
    entries: [],
    createdAt: 0,
  } as unknown as CrossDappBatch;

  assert.deepEqual(getCombinedRequests([], [], [], crossDappBatch), []);
});
