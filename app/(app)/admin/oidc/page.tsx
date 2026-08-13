import { OidcClientForm } from "@/app/(app)/admin/oidc/oidc-client-form";
import { requireSiteAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OidcAdminPage() {
  await requireSiteAdmin();
  return <OidcClientForm />;
}
