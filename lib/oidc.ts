import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

export type OidcConfig = {
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
};

export async function getOidcConfigFromDb() {
  const config = await prisma.oidcConfig.findFirst();
  if (!config) {
    return null;
  }
  return {
    clientId: decrypt(config.clientIdEnc),
    clientSecret: decrypt(config.clientSecretEnc),
    issuerUrl: decrypt(config.issuerUrlEnc),
  } satisfies OidcConfig;
}

export async function upsertOidcConfig(input: OidcConfig) {
  const data = {
    clientIdEnc: encrypt(input.clientId),
    clientSecretEnc: encrypt(input.clientSecret),
    issuerUrlEnc: encrypt(input.issuerUrl),
  };

  const existing = await prisma.oidcConfig.findFirst();
  if (!existing) {
    return prisma.oidcConfig.create({ data });
  }
  return prisma.oidcConfig.update({
    where: { id: existing.id },
    data,
  });
}
