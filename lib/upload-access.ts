import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { hasAnyRole, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";

export async function canAccessUpload(session: Session, uploadId: string) {
  if (hasAnyRole(session.user, WEB_APP_ADMIN_ROLES)) {
    return true;
  }

  const upload = await prisma.uploadHistory.findUnique({
    where: { id: uploadId },
    select: { uploadedBy: true },
  });

  return !!upload && upload.uploadedBy === session.user?.id;
}
