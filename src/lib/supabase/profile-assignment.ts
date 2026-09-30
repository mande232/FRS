import type { AuthUser } from "../auth-context";
import {
  isStoreAssignmentRole,
  parseCentralStockLocation,
  type CentralStockLocation,
  type StockLocation,
  STOCK_LOCATIONS,
} from "../stock-management";

export type ProfileAssignmentFields = {
  assigned_store?: string | null;
  assigned_inventory_locations?: string[] | null;
};

function isStockLocation(value: string): value is StockLocation {
  return (STOCK_LOCATIONS as readonly string[]).includes(value);
}

export function parseAssignedInventoryLocations(
  value: unknown,
  assignedStore?: CentralStockLocation | null,
): StockLocation[] | undefined {
  const fromArray = Array.isArray(value)
    ? value.filter((loc): loc is string => typeof loc === "string").map((loc) => loc.trim()).filter(Boolean)
    : [];
  const locations = [...new Set(fromArray.filter(isStockLocation))];
  if (locations.length) return locations;
  if (assignedStore) return [assignedStore];
  return undefined;
}

export function assignmentFromProfileRow(
  row: ProfileAssignmentFields,
  metadata: Record<string, unknown> = {},
  role?: string,
): Pick<AuthUser, "assignedStore" | "assignedInventoryLocations"> {
  const metaStore =
    typeof metadata.assigned_store === "string"
      ? metadata.assigned_store
      : typeof metadata.assignedStore === "string"
        ? metadata.assignedStore
        : null;
  const assignedStore =
    parseCentralStockLocation(row.assigned_store) ??
    parseCentralStockLocation(metaStore) ??
    undefined;

  const metaLocations =
    metadata.assigned_inventory_locations ?? metadata.assignedInventoryLocations;
  const assignedInventoryLocations = parseAssignedInventoryLocations(
    row.assigned_inventory_locations?.length ? row.assigned_inventory_locations : metaLocations,
    assignedStore,
  );

  if (role && isStoreAssignmentRole(role)) {
    const central =
      assignedStore ??
      assignedInventoryLocations?.find((loc): loc is CentralStockLocation => Boolean(parseCentralStockLocation(loc)));
    return {
      assignedStore: central,
      assignedInventoryLocations: assignedInventoryLocations ?? (central ? [central] : undefined),
    };
  }

  return {
    assignedStore: undefined,
    assignedInventoryLocations,
  };
}

export function assignmentToProfileColumns(input: {
  role: string;
  assignedStore?: CentralStockLocation;
  assignedInventoryLocations?: StockLocation[];
}): { assigned_store: string | null; assigned_inventory_locations: string[] } {
  const locations = [...new Set(input.assignedInventoryLocations ?? [])];
  const store =
    (isStoreAssignmentRole(input.role) ? input.assignedStore : undefined) ??
    locations.find((loc): loc is CentralStockLocation => Boolean(parseCentralStockLocation(loc))) ??
    null;
  const nextLocations =
    locations.length > 0 ? locations : store ? [store] : [];
  return {
    assigned_store: isStoreAssignmentRole(input.role) ? store : null,
    assigned_inventory_locations: nextLocations,
  };
}
