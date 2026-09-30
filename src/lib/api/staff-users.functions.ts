import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const staffRoleSchema = z.enum([
  "Administrator",
  "Inventory Administrator",
  "Branch Manager",
  "Store Manager",
  "Department Manager",
  "Supervisor",
  "Cashier",
  "Waiter",
  "Kitchen Staff",
  "Bar Staff",
  "Bartender",
  "Butcher Staff",
  "Butcher House Staff",
  "Coffee House Staff",
  "Inventory Staff",
  "Storekeeper",
  "Reception",
  "Hotel Staff",
  "Procurement Officer",
  "Chef",
  "Event Coordinator",
  "Accountant",
  "Auditor",
]);

const stockLocationSchema = z.enum([
  "Store 1",
  "Store 2",
  "Main Bar",
  "VIP Bar",
  "Kitchen",
  "Butcher",
  "Coffee House",
]);

const staffMutationSchema = z.object({
  accessToken: z.string().min(1),
  email: z.string().trim().optional(),
  name: z.string().trim().min(1),
  role: staffRoleSchema,
  branch: z.string().trim().min(1),
  staffSalesAll: z.boolean().optional(),
  assignedStore: z.enum(["Store 1", "Store 2"]).optional(),
  assignedInventoryLocations: z.array(stockLocationSchema).optional(),
  password: z.string(),
});

export const createSupabaseStaffUser = createServerFn({ method: "POST" })
  .validator(staffMutationSchema)
  .handler(async ({ data }) => {
    const { createStaffAuthUser } = await import("../supabase/staff-admin.server");
    return createStaffAuthUser(data);
  });

export const updateSupabaseStaffUser = createServerFn({ method: "POST" })
  .validator(staffMutationSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { updateStaffAuthUser } = await import("../supabase/staff-admin.server");
    return updateStaffAuthUser(data);
  });

export const deactivateSupabaseStaffUser = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), accessToken: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { deactivateStaffAuthUser } = await import("../supabase/staff-admin.server");
    return deactivateStaffAuthUser(data);
  });
