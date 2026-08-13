/**
 * Renders an untrusted value safe to place in a log line.
 *
 * Two separate problems, both flagged by CodeQL against these call sites:
 *  - Log injection: CR/LF (and other control characters) let a caller forge
 *    additional log entries, which matters because these logs sit alongside
 *    the audit trail during incident review.
 *  - Format-string injection: Node treats the first console.* argument as a
 *    format string, so `%s`/`%d`/`%j` in user input reorders or swallows the
 *    remaining arguments. Callers must keep the format string static and pass
 *    untrusted values as *separate* arguments; this function additionally
 *    neutralises any `%` so a value cannot misbehave if that rule is broken.
 */
export function forLog(value: unknown, maxLength = 200): string {
  const text = typeof value === "string" ? value : String(value);
  return text
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/%/g, "%%")
    .slice(0, maxLength);
}
