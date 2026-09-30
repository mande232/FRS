import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  filterPendingRequestsForStoreReview,
  filterRequestsForIssueVoucher,
  findStoreIssueVoucherForRequest,
} from "./store-issue-voucher-utils.ts";

const baseRequest = {
  id: "srq-1",
  requestNumber: "SRQ-0001",
  status: "Approved",
  requestedSourceStore: "Store 1",
  requestingDepartment: "Main Bar",
};

describe("filterRequestsForIssueVoucher", () => {
  test("includes approved requests for the supplying store workspace", () => {
    const rows = filterRequestsForIssueVoucher(["Store 1"], [baseRequest], "Store 1");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, "srq-1");
  });

  test("excludes approved requests after conversion status", () => {
    const rows = filterRequestsForIssueVoucher(
      ["Store 1"],
      [{ ...baseRequest, status: "Converted to Issue Voucher" }],
      "Store 1",
    );
    assert.equal(rows.length, 0);
  });

  test("store keepers only see requests for their assigned store", () => {
    const rows = filterRequestsForIssueVoucher(
      ["Store 1"],
      [{ ...baseRequest, requestedSourceStore: "Store 2" }],
      "Store 1",
    );
    assert.equal(rows.length, 0);
  });
});

describe("filterPendingRequestsForStoreReview", () => {
  test("includes submitted requests for the supplying store", () => {
    const rows = filterPendingRequestsForStoreReview(
      ["Store 1"],
      [{ ...baseRequest, status: "Submitted" }],
      "Store 1",
    );
    assert.equal(rows.length, 1);
  });

  test("excludes approved requests from pending review", () => {
    const rows = filterPendingRequestsForStoreReview(["Store 1"], [baseRequest], "Store 1");
    assert.equal(rows.length, 0);
  });
});

describe("findStoreIssueVoucherForRequest", () => {
  test("matches active vouchers linked by request number", () => {
    const match = findStoreIssueVoucherForRequest(
      [
        {
          id: "siv-srq-1",
          issueVoucherNumber: "SIV-0001",
          relatedStockRequest: "SRQ-0001",
          status: "Approved",
        },
      ],
      { id: "srq-1", requestNumber: "SRQ-0001" },
    );
    assert.equal(match?.issueVoucherNumber, "SIV-0001");
  });

  test("ignores received vouchers so approved requests stay convertible", () => {
    const match = findStoreIssueVoucherForRequest(
      [
        {
          id: "siv-srq-1",
          issueVoucherNumber: "SIV-0001",
          relatedStockRequest: "SRQ-0001",
          status: "Received",
        },
      ],
      { id: "srq-1", requestNumber: "SRQ-0001" },
    );
    assert.equal(match, undefined);
  });
});
