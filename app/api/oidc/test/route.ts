import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const testSchema = z.object({
    issuerUrl: z.string().url(),
});

export async function POST(request: NextRequest) {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
        await requireAdmin();
        const body = await request.json();
        const { issuerUrl } = testSchema.parse(body);

        const discoveryUrl = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;

        const response = await fetch(discoveryUrl, {
            method: "GET",
            headers: { "Accept": "application/json" },
            // Shorter timeout for testing
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Discovery document not found or server returned ${response.status}` },
                { status: 400 }
            );
        }

        const data = await response.json();

        // Basic verification of OIDC document
        if (!data.issuer || !data.authorization_endpoint) {
            return NextResponse.json(
                { error: "Invalid OIDC discovery document format" },
                { status: 400 }
            );
        }

        return NextResponse.json({ ok: true, issuer: data.issuer });
    } catch (error: unknown) {
        const err = error as Error;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid Issuer URL format" }, { status: 400 });
        }
        return NextResponse.json(
            { error: err.message || "Failed to reach OIDC provider" },
            { status: 500 }
        );
    }
}
