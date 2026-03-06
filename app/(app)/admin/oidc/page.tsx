import { OidcClientForm } from "@/app/(app)/admin/oidc/oidc-client-form";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OidcAdminPage() {
  await requireAdmin();
  return <OidcClientForm />;
}
