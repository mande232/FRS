import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { PosPersistenceInput } from "../supabase/pos-persistence.server";

const persistenceSchema = z.object({
  accessToken: z.string().min(1),
  menuItems: z.array(z.unknown()).optional(),
  menuCategories: z.array(z.string()).optional(),
  tables: z.array(z.unknown()).optional(),
  orders: z.array(z.unknown()).optional(),
  stations: z.array(z.string()).optional(),
  stock: z.array(z.unknown()).optional(),
  suppliers: z.array(z.unknown()).optional(),
  reservations: z.array(z.unknown()).optional(),
  customers: z.array(z.unknown()).optional(),
  payments: z.array(z.unknown()).optional(),
  salesRecords: z.array(z.unknown()).optional(),
  expenseRecords: z.array(z.unknown()).optional(),
  purchaseOrders: z.array(z.unknown()).optional(),
  guestOrderRequests: z.array(z.unknown()).optional(),
  restaurantProfile: z.unknown().optional(),
});

export const persistPosRecords = createServerFn({ method: "POST" })
  .validator(persistenceSchema)
  .handler(async ({ data }) => {
    const { persistPosRecordsWithServiceRole } = await import("../supabase/pos-persistence.server");
    return persistPosRecordsWithServiceRole(data as PosPersistenceInput);
  });
