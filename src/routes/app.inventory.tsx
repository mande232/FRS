import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app/inventory")({ component: () => <Navigate to="/app/stock-management" /> });
