import { readFileSync } from "node:fs";
import { extractTrustmarquePentestPdf } from "../lib/pentest-pdf-builtin";

const files = [
    "C:/Users/P10292030/Downloads/PT2141-Capita_Intelligent_Communications-Capita_CIC_IT_Services_Penetration_Test-Trustmarque_Cyber_Security_Test_Report-v1.0.pdf",
    "C:/Users/P10292030/Downloads/PT2903-Capita_Intelligent_Communication_Inbound_Services-Trustmarque_Cyber_Security_CHECK_Report_v1.0 1.pdf",
    "C:/Users/P10292030/Downloads/PT2904-Capita_Intelligent_Communication-CIC_Outbound_Services-Trustmarque_Cyber_Security_CHECK_Report_v1.0 1.pdf",
    "C:/Users/P10292030/Downloads/PT2905-Capita_Intelligent_Communication-CIC_Outbound_Services-Trustmarque_Cyber_Security_CHECK_Report_v1.0 1.pdf",
    "C:/Users/P10292030/Downloads/PT3195-Capita Intelligent Communications-CIC IT Services Pen Test 2026-Trustmarque_Cyber_Security_CHECK_Report_v1.0.pdf",
];

(async () => {
    for (const f of files) {
        const buf = readFileSync(f);
        const r = await extractTrustmarquePentestPdf(buf);
        const pt = f.match(/PT\d+/)?.[0];
        console.log(`\n=== ${pt} (${r.Results.issues.length} findings) ===`);
        for (const i of r.Results.issues) {
            const sys = i["Systems Affected"];
            const summary = sys.map((s) => `${s["IP Address"]}:${s.Port}`).join(", ");
            const flag = sys.some((s) => s.Port === "0" || s["IP Address"] === "unspecified") ? " ⚠" : "";
            console.log(`  ${i.ID} [${sys.length}]${flag} -> ${summary}`);
        }
    }
})();
