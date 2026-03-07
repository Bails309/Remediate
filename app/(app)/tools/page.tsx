import { requirePentestUser } from "@/lib/rbac";
import { ToolsClient } from "./tools-client";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const session = await requirePentestUser();
  return <ToolsClient session={session} />;
}
