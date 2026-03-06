import { twMerge } from "tailwind-merge";

function flattenClasses(input: unknown[]): string[] {
  const out: string[] = [];
  for (const item of input) {
    if (!item) continue;
    if (Array.isArray(item)) {
      out.push(...flattenClasses(item));
    } else if (typeof item === "string") {
      out.push(item);
    }
  }
  return out;
}

export function cn(...classes: Array<string | false | null | undefined | Array<string | null | undefined>>) {
  const flattened = flattenClasses(classes);
  const joined = flattened.join(" ");
  return twMerge(joined);
}
