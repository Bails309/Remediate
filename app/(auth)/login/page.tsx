"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export default function LoginPage() {
  const localEnabled = process.env.NEXT_PUBLIC_LOCAL_AUTH_ENABLED === "true";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState<boolean | null>(null);

  const signInLocal = async () => {
    setError("");
    const result = await signIn("credentials", {
      redirect: false,
      username,
      password,
      callbackUrl: "/dashboard",
    });
    if (result?.error) {
      setError("Invalid local credentials");
      return;
    }
    if (result?.url) {
      window.location.href = result.url;
    }
  };

  useEffect(() => {
    let mounted = true;
    fetch("/api/oidc/enabled")
      .then((r) => r.json())
      .then((body) => {
        if (mounted) setSsoEnabled(Boolean(body?.enabled));
      })
      .catch(() => {
        if (mounted) setSsoEnabled(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="glass grid-texture w-full max-w-lg rounded-[32px] p-10 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-accent-2)]">Secure Access</p>
        <h1 className="mt-4 text-3xl font-semibold">Sign in to Remediate</h1>
        <p className="mt-2 text-sm opacity-70">
          {ssoEnabled === null
            ? "Loading authentication methods…"
            : ssoEnabled
            ? "Use your Keycloak SSO to enter the triage workspace."
            : "Sign in to the triage workspace using local credentials."}
        </p>
        <div className="mt-8">
          {ssoEnabled && (
            <Button onClick={() => signIn("keycloak", { callbackUrl: "/dashboard" })}>Continue with SSO</Button>
          )}
        </div>

        {localEnabled && (
          <div className="mt-10 border-t border-[color:var(--color-border)] pt-6 text-left">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-accent-2)]">Local Dev</p>
            <div className="mt-4 space-y-3">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
              />
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button onClick={signInLocal}>Sign in locally</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
