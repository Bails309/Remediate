import { requireToolkitUser } from "@/lib/rbac";
import { ToolsClient } from "./tools-client";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const session = await requireToolkitUser();
  return <ToolsClient session={session} />;
}
