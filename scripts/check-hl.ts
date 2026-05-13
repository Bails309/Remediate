import { extractTrustmarquePentestPdf } from "../lib/pentest-pdf-builtin";
import { readFileSync } from "node:fs";

(async () => {
    const b = readFileSync(
        "C:/Users/P10292030/Downloads/PT3195-Capita Intelligent Communications-CIC IT Services Pen Test 2026-Trustmarque_Cyber_Security_CHECK_Report_v1.0.pdf",
    );
    const r = await extractTrustmarquePentestPdf(b);
    for (const id of ["PT3195-EPT-001", "PT3195-WEB-001"]) {
        const i = r.Results.issues.find((x) => x.ID === id);
        if (!i) continue;
        const ex = (i as { Examples?: string | null }).Examples ?? "";
        console.log(`--- ${id} Examples ---`);
        console.log(ex.replace(/\u0001HL\u0002/g, "[HL]").replace(/\u0001\/HL\u0002/g, "[/HL]"));
    }
})();
