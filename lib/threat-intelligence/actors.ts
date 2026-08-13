import { prisma } from "@/lib/prisma";

const ATTACK_BUNDLE_URL =
    "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json";

const FETCH_TIMEOUT = 120_000;
export const ATTACK_FEED_ID = "MITRE_ATTACK";

type StixObject = {
    id: string;
    type: string;
    name?: string;
    description?: string;
    aliases?: string[];
    modified?: string;
    revoked?: boolean;
    x_mitre_deprecated?: boolean;
    external_references?: { source_name?: string; external_id?: string; url?: string }[];
    kill_chain_phases?: { kill_chain_name?: string; phase_name?: string }[];
    relationship_type?: string;
    source_ref?: string;
    target_ref?: string;
};

/** ATT&CK does not model attribution, so these are keyword-derived from the group description. */
const SECTOR_KEYWORDS: Record<string, string[]> = {
    Government: ["government", "public sector", "ministr", "diplomat", "embass", "political"],
    Defense: ["defense", "defence", "military", "aerospace", "weapons"],
    Technology: ["technology", "software", "it service", "semiconductor", "cloud provider"],
    Telecommunications: ["telecom", "telecommunication", "internet service provider"],
    Finance: ["financial", "finance", "bank", "cryptocurrency", "fintech", "insurance"],
    Healthcare: ["healthcare", "health care", "hospital", "pharmaceutic", "medical"],
    Energy: ["energy", "oil", "gas", "utilit", "electric", "petroleum", "nuclear"],
    Education: ["education", "universit", "academ", "research institut"],
    Manufacturing: ["manufactur", "industrial", "automotive", "chemical"],
    Retail: ["retail", "hospitality", "e-commerce", "restaurant", "casino", "gaming"],
    Transportation: ["transport", "aviation", "airline", "maritime", "shipping", "logistics"],
    Media: ["media", "journalis", "news organization", "broadcast"],
    NGO: ["non-governmental", "ngo", "think tank", "human rights", "activist", "dissident"],
};

const REGION_KEYWORDS: Record<string, string[]> = {
    "North America": ["north america", "united states", "u.s.", "us-based", "canada", "mexico"],
    "Western Europe": ["western europe", "united kingdom", "germany", "france", "spain", "italy", "netherlands", "belgium", "europe"],
    "Eastern Europe": ["eastern europe", "ukraine", "poland", "belarus", "georgia", "baltic", "russia"],
    "Middle East": ["middle east", "israel", "saudi", "iran", "iraq", "uae", "united arab emirates", "kuwait", "qatar", "turkey", "lebanon", "syria"],
    "East Asia": ["east asia", "china", "taiwan", "japan", "south korea", "hong kong", "mongolia"],
    "Southeast Asia": ["southeast asia", "vietnam", "thailand", "philippines", "malaysia", "singapore", "indonesia", "cambodia", "myanmar"],
    "South Asia": ["south asia", "india", "pakistan", "bangladesh", "sri lanka", "afghanistan", "nepal"],
    Africa: ["africa", "nigeria", "kenya", "south africa", "egypt", "morocco"],
    "Latin America": ["latin america", "south america", "brazil", "argentina", "colombia", "chile", "venezuela"],
    Oceania: ["oceania", "australia", "new zealand"],
};

const ORIGIN_KEYWORDS: Record<string, string[]> = {
    China: ["chinese", "china-based", "china-nexus", "people's republic of china", "ministry of state security"],
    Russia: ["russian", "russia-based", "russia-nexus", "gru", "svr", "fsb"],
    Iran: ["iranian", "iran-based", "iran-nexus", "islamic revolutionary guard"],
    "North Korea": ["north korean", "north korea-based", "dprk", "reconnaissance general bureau", "lazarus"],
    Vietnam: ["vietnamese", "vietnam-based"],
    India: ["indian threat", "india-based", "india-nexus"],
    Pakistan: ["pakistani", "pakistan-based"],
    "South Korea": ["south korean threat", "south korea-based"],
    Belarus: ["belarusian", "belarus-based"],
    Turkey: ["turkish", "turkey-based"],
    Nigeria: ["nigerian", "nigeria-based"],
};

const STATE_KEYWORDS = ["state-sponsored", "state sponsored", "nation-state", "nation state", "government-sponsored", "intelligence service", "espionage group", "ministry of state security", "military unit"];
const CRIME_KEYWORDS = ["financially motivated", "financially-motivated", "cybercrime", "criminal group", "ransomware", "extortion", "carding", "banking trojan"];
const HACKTIVIST_KEYWORDS = ["hacktivist", "hacktivism", "ideologically motivated"];

function matchKeywords(text: string, table: Record<string, string[]>): string[] {
    return Object.entries(table)
        .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
        .map(([label]) => label);
}

/** Products and platforms commonly named in ATT&CK group descriptions. */
const TECHNOLOGY_KEYWORDS: Record<string, string[]> = {
    "Microsoft Exchange": ["exchange server", "microsoft exchange", "proxylogon", "proxyshell", "owa"],
    "Active Directory": ["active directory", "domain controller", "kerberos", "ntlm"],
    "Microsoft 365": ["office 365", "microsoft 365", "o365", "sharepoint", "onedrive", "outlook web"],
    "Azure / Entra ID": ["azure ad", "entra id", "azure active directory", "microsoft azure"],
    "VPN Appliances": ["pulse secure", "fortinet", "fortigate", "ivanti", "sonicwall", "vpn appliance", "global protect", "palo alto network"],
    Citrix: ["citrix", "netscaler"],
    "VMware / ESXi": ["vmware", "esxi", "vcenter", "vsphere"],
    "Atlassian Confluence": ["confluence", "atlassian"],
    "Apache / Log4j": ["log4j", "log4shell", "apache struts", "apache http", "apache server", "tomcat"],
    Linux: ["linux server", "linux system", "linux host", "unix system"],
    "Containers / Kubernetes": ["kubernetes", "docker", "container runtime", "containerized"],
    "Cloud Storage": ["amazon s3", "aws s3", "blob storage", "cloud storage bucket"],
    "Web Servers": ["web server", "iis server", "nginx", "web shell", "webshell"],
    Databases: ["sql server", "mysql", "postgresql", "mongodb", "redis", "elasticsearch", "oracle database"],
    "Managed File Transfer": ["moveit", "goanywhere", "accellion", "cleo", "file transfer appliance"],
    "Network Devices": ["cisco router", "cisco ios", "juniper", "network device", "edge device", "soho router"],
    "Remote Access Tools": ["remote desktop protocol", "rdp", "teamviewer", "anydesk", "vnc"],
    "Supply Chain Software": ["solarwinds", "orion platform", "kaseya", "managed service provider", "software supply chain"],
    "Mobile Devices": ["android device", "ios device", "mobile device", "smartphone"],
    "ICS / OT": ["industrial control", "scada", "plc", "operational technology"],
};

export function deriveTechnologies(description: string): string[] {
    return matchKeywords(description.toLowerCase(), TECHNOLOGY_KEYWORDS);
}

export function classifyActorType(description: string): string | null {
    const text = description.toLowerCase();
    if (STATE_KEYWORDS.some((keyword) => text.includes(keyword))) return "State Sponsored";
    if (CRIME_KEYWORDS.some((keyword) => text.includes(keyword))) return "Cybercrime";
    if (HACKTIVIST_KEYWORDS.some((keyword) => text.includes(keyword))) return "Hacktivist";
    return null;
}

export function deriveAttribution(description: string) {
    const text = description.toLowerCase();
    const origins = matchKeywords(text, ORIGIN_KEYWORDS);
    return {
        actorType: classifyActorType(description),
        origin: origins[0] ?? null,
        targetSectors: matchKeywords(text, SECTOR_KEYWORDS),
        targetRegions: matchKeywords(text, REGION_KEYWORDS),
        targetTechnologies: matchKeywords(text, TECHNOLOGY_KEYWORDS),
    };
}

export type ParsedActor = {
    externalId: string;
    stixId: string;
    name: string;
    aliases: string[];
    description: string | null;
    actorType: string | null;
    origin: string | null;
    targetSectors: string[];
    targetRegions: string[];
    targetTechnologies: string[];
    tactics: string[];
    software: string[];
    techniqueCount: number;
    url: string | null;
    lastModified: Date;
};

function titleCasePhase(phase: string) {
    return phase.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/** Turns a raw ATT&CK STIX bundle into actor rows ready for upsert. */
export function parseAttackBundle(objects: StixObject[]): ParsedActor[] {
    const groups = new Map<string, StixObject>();
    const techniqueTactics = new Map<string, string[]>();
    const softwareNames = new Map<string, string>();
    const usesByGroup = new Map<string, string[]>();

    for (const object of objects) {
        if (object.revoked || object.x_mitre_deprecated) continue;

        if (object.type === "intrusion-set") {
            groups.set(object.id, object);
        } else if (object.type === "attack-pattern") {
            const phases = (object.kill_chain_phases ?? [])
                .filter((phase) => phase.kill_chain_name === "mitre-attack" && phase.phase_name)
                .map((phase) => titleCasePhase(phase.phase_name!));
            techniqueTactics.set(object.id, phases);
        } else if ((object.type === "malware" || object.type === "tool") && object.name) {
            softwareNames.set(object.id, object.name);
        } else if (object.type === "relationship" && object.relationship_type === "uses" && object.source_ref && object.target_ref) {
            const targets = usesByGroup.get(object.source_ref) ?? [];
            targets.push(object.target_ref);
            usesByGroup.set(object.source_ref, targets);
        }
    }

    const actors: ParsedActor[] = [];

    for (const [stixId, group] of groups) {
        const reference = (group.external_references ?? []).find((ref) => ref.source_name === "mitre-attack");
        if (!reference?.external_id) continue;

        const targets = usesByGroup.get(stixId) ?? [];
        const tactics = new Set<string>();
        const software = new Set<string>();
        let techniqueCount = 0;

        for (const target of targets) {
            const phases = techniqueTactics.get(target);
            if (phases) {
                techniqueCount += 1;
                phases.forEach((phase) => tactics.add(phase));
                continue;
            }
            const name = softwareNames.get(target);
            if (name) software.add(name);
        }

        const description = group.description ?? "";
        const attribution = deriveAttribution(description);

        actors.push({
            externalId: reference.external_id,
            stixId,
            name: group.name ?? reference.external_id,
            aliases: (group.aliases ?? []).filter((alias) => alias !== group.name),
            description: description ? description.slice(0, 4000) : null,
            ...attribution,
            tactics: [...tactics].sort(),
            software: [...software].sort(),
            techniqueCount,
            url: reference.url ?? null,
            lastModified: group.modified ? new Date(group.modified) : new Date(),
        });
    }

    return actors.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchAttackBundle(): Promise<StixObject[]> {
    const response = await fetch(ATTACK_BUNDLE_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`MITRE ATT&CK bundle fetch failed: ${response.status}`);
    }
    const bundle = (await response.json()) as { objects?: StixObject[] };
    return bundle.objects ?? [];
}

/**
 * Refreshes the ThreatActor table from MITRE ATT&CK. Safe to run repeatedly;
 * actors are matched on their MITRE group id.
 */
export async function syncThreatActors(): Promise<{ synced: number }> {
    const objects = await fetchAttackBundle();
    const actors = parseAttackBundle(objects);

    for (const actor of actors) {
        const { externalId, ...data } = actor;
        await prisma.threatActor.upsert({
            where: { externalId },
            update: { ...data, syncedAt: new Date() },
            create: { externalId, ...data },
        });
    }

    await prisma.threatFeedMetadata.upsert({
        where: { id: ATTACK_FEED_ID },
        update: { lastSyncedAt: new Date() },
        create: { id: ATTACK_FEED_ID, lastSyncedAt: new Date() },
    });

    console.log(`[ThreatActors] Synced ${actors.length} MITRE ATT&CK groups`);
    return { synced: actors.length };
}

/** Runs a sync when the catalogue has not been refreshed within `maxAgeHours`. */
export async function syncThreatActorsIfStale(maxAgeHours = 24 * 7): Promise<boolean> {
    const metadata = await prisma.threatFeedMetadata.findUnique({ where: { id: ATTACK_FEED_ID } });
    const actorCount = await prisma.threatActor.count();
    const age = metadata ? Date.now() - metadata.lastSyncedAt.getTime() : Number.POSITIVE_INFINITY;

    if (actorCount > 0 && age < maxAgeHours * 60 * 60 * 1000) return false;

    await syncThreatActors();
    return true;
}
