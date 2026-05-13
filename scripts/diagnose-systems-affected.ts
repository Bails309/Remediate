/**
 * Diagnostic: dump the "Systems Affected" section for every finding so we can see what
 * format/whitespace the parser is choking on.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFParse } from "pdf-parse";

async function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error("Usage: tsx scripts/diagnose-systems-affected.ts <path-to-pdf>");
        process.exit(1);
    }
    const bytes = readFileSync(resolve(arg));
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    const raw = (await parser.getText()).text;
    await parser.destroy().catch(() => undefined);

    const text = raw
        .split(/\r?\n/)
        .filter((line) => {
            const t = line.trim();
            if (t === "") return true;
            if (t === "OFFICIAL") return false;
            if (/^Copyright\s+©\s+Trustmarque\s+\d{4}\s+OFFICIAL\s+Page\s+\d+\s+of\s+\d+$/i.test(t)) return false;
            if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(t)) return false;
            if (/\.{3,}\s*\d+\s*$/.test(t)) return false;
            return true;
        })
        .join("\n");

    const detailedStart = text.search(/^\s*DETAILED FINDINGS\s*$/im);
    const appendixStart = text.search(/^\s*APPENDIX\s*$/im);
    const scope = text.slice(
        detailedStart >= 0 ? detailedStart : 0,
        appendixStart > 0 ? appendixStart : text.length,
    );

    const headingRe = /(PT\d+-[A-Z]+-\d{3,})\s*-\s*([^\n]+)/g;
    const headings: { id: string; index: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(scope)) !== null) {
        const lineStart = scope.lastIndexOf("\n", m.index) + 1;
        const prefix = scope.slice(lineStart, m.index);
        if (prefix.trim().length > 0) continue;
        headings.push({ id: m[1], index: m.index });
    }

    for (let i = 0; i < headings.length; i++) {
        const start = headings[i].index;
        const end = i + 1 < headings.length ? headings[i + 1].index : scope.length;
        const body = scope.slice(start, end);
        const labelMatch = body.match(/^\s*Systems Affected\s*$/im);
        if (!labelMatch || labelMatch.index === undefined) {
            console.log(`\n=== ${headings[i].id} === [NO Systems Affected label found]`);
            continue;
        }
        const descMatch = body.match(/^\s*Description\s*$/im);
        const sectionStart = labelMatch.index + labelMatch[0].length;
        const sectionEnd = descMatch && descMatch.index !== undefined ? descMatch.index : sectionStart + 800;
        const section = body.slice(sectionStart, sectionEnd);
        console.log(`\n=== ${headings[i].id} ===`);
        console.log(JSON.stringify(section));
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
