"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [authConfig, setAuthConfig] = useState<{ ssoEnabled: boolean; localEnabled: boolean } | null>(null);

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
        if (mounted) {
          setAuthConfig({
            ssoEnabled: Boolean(body?.ssoEnabled),
            localEnabled: Boolean(body?.localEnabled)
          });
        }
      })
      .catch(() => {
        if (mounted) setAuthConfig({ ssoEnabled: false, localEnabled: false });
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-start SSO when the login page is opened with ?sso=keycloak (useful for portal tiles)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sso = params.get("sso");
      const callback = params.get("callbackUrl") || "/dashboard";
      if (sso === "keycloak") {
        // Wait until we know whether SSO is enabled
        const attempt = async () => {
          // If authConfig is null, wait briefly for the enabled check to complete
          for (let i = 0; i < 10 && authConfig === null; i++) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 150));
          }
          if (authConfig?.ssoEnabled) {
            signIn("keycloak", { callbackUrl: callback });
          }
        };
        attempt();
      }
    } catch (e) {
      // ignore
    }
  }, [authConfig]);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="glass grid-texture w-full max-w-lg rounded-[32px] p-10 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-accent-2)]">Secure Access</p>
        <h1 className="mt-4 text-3xl font-semibold">Sign in to Remediate</h1>
        <p className="mt-2 text-sm opacity-70">
          {authConfig === null
            ? "Loading authentication methods…"
            : authConfig.ssoEnabled
              ? "Use your Keycloak SSO to enter the triage workspace."
              : authConfig.localEnabled
                ? "Sign in to the triage workspace using local credentials."
                : "No authentication methods are enabled. Please check your configuration."}
        </p>
        <div className="mt-8">
          {authConfig?.ssoEnabled && (
            <Button onClick={() => signIn("keycloak", { callbackUrl: "/dashboard" })} title="Redirects to Keycloak to sign in via SSO. If you used a portal tile, use the login?sso=keycloak entrypoint to auto-start SSO.">Continue with SSO</Button>
          )}
        </div>

        {authConfig?.localEnabled && (
          <div className="mt-10 border-t border-[color:var(--color-border)] pt-6 text-left">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-accent-2)]">Local Dev</p>
            <div className="mt-4 space-y-3">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                title="Local sign-in is intended for development or emergency access only."
              />
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                title="Local sign-in is intended for development or emergency access only."
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button onClick={signInLocal} title="Sign in using local credentials (dev only)">Sign in locally</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
