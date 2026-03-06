import { Providers } from "@/app/(app)/providers";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return <Providers>{children}</Providers>;
}
