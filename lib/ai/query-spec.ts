import { z } from "zod";

/**
 * The constrained argument schema for the AI assistant's `search_vulnerabilities`
 * tool. The model may only express filters/sorts described here, which we validate
 * before executing deterministically with Prisma under the caller's RBAC /
 * visibility rules. Unknown keys emitted by the model are stripped (Zod default),
 * so a prompt-injection payload cannot introduce raw SQL or arbitrary columns.
 */

export const RISK_VALUES = ["Critical", "High", "Medium", "Low", "None"] as const;

export const STATUS_VALUES = [
  "Open",
  "Remediated",
  "FalsePositive",
  "NoFixAvailable",
  "InProgress",
  "InProgressWithCR",
  "Sunset",
  "AwaitingVendor",
] as const;

export const SCANNER_VALUES = ["NESSUS", "ACR"] as const;

export const SORT_FIELDS = ["cvssScore", "lastSeenAt", "risk"] as const;

export const querySpecSchema = z.object({
  /** A short restatement of what the query does, shown back to the user. */
  summary: z.string().max(300).optional(),
  risk: z.array(z.enum(RISK_VALUES)).min(1).max(5).optional(),
  status: z.array(z.enum(STATUS_VALUES)).min(1).max(8).optional(),
  scannerType: z.enum(SCANNER_VALUES).optional(),
  /** True = only findings that have a fix/remediation available. */
  hasFix: z.boolean().optional(),
  /** True = only internet-facing pentest findings (PT-prefixed plugin IDs). */
  internetFacing: z.boolean().optional(),
  cveContains: z.string().max(50).optional(),
  nameContains: z.string().max(100).optional(),
  hostContains: z.string().max(100).optional(),
  packageContains: z.string().max(100).optional(),
  minCvss: z.number().min(0).max(10).optional(),
  sortBy: z.enum(SORT_FIELDS).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type QuerySpec = z.infer<typeof querySpecSchema>;
