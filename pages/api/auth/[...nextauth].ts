import NextAuth from "next-auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { buildAuthOptions } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const options = await buildAuthOptions();
  return NextAuth(options)(req, res);
}
