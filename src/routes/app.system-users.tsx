import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app/system-users")({
  component: () => <Navigate to="/app/staff" search={{ tab: "accounts" }} replace />,
});
