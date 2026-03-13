import { parse, isValid } from 'date-fns';

function parseValidDate(value) {
    if (!value) return null;
    const s = value.toString().trim();

    const formats = ["dd/MM/yyyy", "d/M/yyyy", "MM/dd/yyyy", "M/d/yyyy", "yyyy-MM-dd", "yyyy/MM/dd", "MMM d, yyyy", "MMMM d, yyyy"];
    for (const fmt of formats) {
        const parsed = parse(s, fmt, new Date());
        if (isValid(parsed)) {
            return parsed;
        }
    }

    const d = new Date(s);
    if (!isNaN(d.getTime()) && s.includes(d.getFullYear().toString())) return d;

    return null;
}

function test(dateStr, graceDays) {
    const now = new Date();
    const pubDate = parseValidDate(dateStr);
    if (!pubDate) {
        console.log(`[${dateStr}] FAILED TO PARSE`);
        return true; // Included if parsing fails
    }
    const diffTime = Math.abs(now.getTime() - pubDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const excluded = diffDays <= graceDays;
    console.log(`[${dateStr}] -> Parsed: ${pubDate.toISOString()} | DiffDays: ${diffDays} | Excluded: ${excluded}`);
    return !excluded;
}

const grace = 30;
console.log(`Testing with grace period: ${grace} days`);
console.log(`Now: ${new Date().toISOString()}`);

test("2026-03-10", grace); // Recent
test("2026-02-01", grace); // Old (> 30 days)
test("Mar 10, 2026", grace); // Recent
test("10/03/2026", grace); // Recent (UK)
test("03/10/2026", grace); // Recent (US)
test("March 13, 2026", grace); // Recent
test("2026/03/10", grace); // Recent (New format)
test("2025/01/01", grace); // Very old
test("", grace); // Empty
test("N/A", grace); // Invalid
