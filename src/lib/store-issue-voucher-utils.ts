/** Lightweight helpers for store issue vouchers (avoids importing stock-management in workflow inbox). */

export type IssueVoucherRequestLink = {
  id: string;
  issueVoucherNumber: string;
  relatedStockRequest?: string;
  status?: string;
};

/** Voucher statuses that still occupy the issue workflow for a request. */
const ACTIVE_ISSUE_VOUCHER_STATUSES = new Set([
  "Approved",
  "Partially Approved",
  "Prepared",
  "Dispatched",
  "Partially Received",
]);

export type LinkedStockRequestRef = {
  id: string;
  requestNumber?: string;
  stockRequestNumber?: string;
};

export type IssueVoucherRequestCandidate = LinkedStockRequestRef & {
  requestNumber: string;
  status: string;
  requestedSourceStore: string;
  requestingDepartment: string;
};

const APPROVED_FOR_ISSUE = new Set(["Approved", "Partially Approved"]);
const PENDING_STORE_REVIEW = new Set(["Submitted", "Under Review"]);

/** Approved dept requests this store user can convert — keyed on source store, not dept workspace. */
export function filterRequestsForIssueVoucher<T extends IssueVoucherRequestCandidate>(
  authorizedLocations: readonly string[] | "all",
  requests: T[],
  workspace: string = "all",
): T[] {
  return requests.filter((row) => {
    if (!APPROVED_FOR_ISSUE.has(row.status)) return false;
    if (authorizedLocations !== "all" && !authorizedLocations.includes(row.requestedSourceStore)) {
      return false;
    }
    if (workspace !== "all") {
      if (workspace === "Store 1" || workspace === "Store 2") {
        return row.requestedSourceStore === workspace;
      }
      return row.requestingDepartment === workspace || row.requestedSourceStore === workspace;
    }
    return true;
  });
}

/** Pending dept requests awaiting store approval — keyed on supplying store. */
export function filterPendingRequestsForStoreReview<T extends IssueVoucherRequestCandidate>(
  authorizedLocations: readonly string[] | "all",
  requests: T[],
  workspace: string = "all",
): T[] {
  return requests.filter((row) => {
    if (!PENDING_STORE_REVIEW.has(row.status)) return false;
    if (authorizedLocations !== "all" && !authorizedLocations.includes(row.requestedSourceStore)) {
      return false;
    }
    if (workspace !== "all") {
      if (workspace === "Store 1" || workspace === "Store 2") {
        return row.requestedSourceStore === workspace;
      }
      return row.requestingDepartment === workspace;
    }
    return true;
  });
}

function voucherLinksToRequest(
  voucher: IssueVoucherRequestLink,
  request: LinkedStockRequestRef,
  requestNumber: string | undefined,
): boolean {
  return (
    voucher.id === `siv-${request.id}` ||
    (requestNumber != null && voucher.relatedStockRequest === requestNumber) ||
    voucher.relatedStockRequest === request.id
  );
}

export function findStoreIssueVoucherForRequest(
  vouchers: IssueVoucherRequestLink[],
  request: LinkedStockRequestRef,
): IssueVoucherRequestLink | undefined {
  const requestNumber = request.stockRequestNumber ?? request.requestNumber;
  return vouchers.find(
    (voucher) =>
      (!voucher.status || ACTIVE_ISSUE_VOUCHER_STATUSES.has(voucher.status)) &&
      voucherLinksToRequest(voucher, request, requestNumber),
  );
}
