import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Uploads are split per source; keep this route working for old links.
export default function UploadsPage() {
  redirect("/uploads/nessus");
}
