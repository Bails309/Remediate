import { describe, it, expect } from "vitest";
import { parseAttackBundle, classifyActorType, deriveAttribution } from "@/lib/threat-intelligence/actors";

const bundle = [
  {
    id: "intrusion-set--1",
    type: "intrusion-set",
    name: "APT99",
    aliases: ["APT99", "Fancy Test"],
    description:
      "APT99 is a Chinese state-sponsored espionage group that has targeted government and telecommunications organizations in North America and East Asia.",
    modified: "2026-01-02T00:00:00.000Z",
    external_references: [
      { source_name: "mitre-attack", external_id: "G9999", url: "https://attack.mitre.org/groups/G9999" },
    ],
  },
  {
    id: "intrusion-set--revoked",
    type: "intrusion-set",
    name: "Gone",
    revoked: true,
    external_references: [{ source_name: "mitre-attack", external_id: "G0000" }],
  },
  {
    id: "attack-pattern--1",
    type: "attack-pattern",
    name: "Phishing",
    kill_chain_phases: [{ kill_chain_name: "mitre-attack", phase_name: "initial-access" }],
  },
  {
    id: "attack-pattern--2",
    type: "attack-pattern",
    name: "Valid Accounts",
    kill_chain_phases: [
      { kill_chain_name: "mitre-attack", phase_name: "privilege-escalation" },
      { kill_chain_name: "other-chain", phase_name: "ignored" },
    ],
  },
  { id: "malware--1", type: "malware", name: "TestRAT" },
  { id: "relationship--1", type: "relationship", relationship_type: "uses", source_ref: "intrusion-set--1", target_ref: "attack-pattern--1" },
  { id: "relationship--2", type: "relationship", relationship_type: "uses", source_ref: "intrusion-set--1", target_ref: "attack-pattern--2" },
  { id: "relationship--3", type: "relationship", relationship_type: "uses", source_ref: "intrusion-set--1", target_ref: "malware--1" },
  { id: "relationship--4", type: "relationship", relationship_type: "mitigates", source_ref: "course-of-action--1", target_ref: "attack-pattern--1" },
];

describe("parseAttackBundle", () => {
  it("maps an intrusion set to an actor with tactics and tooling", () => {
    const actors = parseAttackBundle(bundle);
    expect(actors).toHaveLength(1);

    const actor = actors[0];
    expect(actor.externalId).toBe("G9999");
    expect(actor.name).toBe("APT99");
    expect(actor.aliases).toEqual(["Fancy Test"]);
    expect(actor.tactics).toEqual(["Initial Access", "Privilege Escalation"]);
    expect(actor.software).toEqual(["TestRAT"]);
    expect(actor.techniqueCount).toBe(2);
    expect(actor.url).toBe("https://attack.mitre.org/groups/G9999");
  });

  it("skips revoked and deprecated groups", () => {
    const actors = parseAttackBundle(bundle);
    expect(actors.some((actor) => actor.externalId === "G0000")).toBe(false);
  });

  it("ignores groups without a MITRE external id", () => {
    const actors = parseAttackBundle([
      { id: "intrusion-set--x", type: "intrusion-set", name: "Unlisted", external_references: [{ source_name: "other" }] },
    ]);
    expect(actors).toHaveLength(0);
  });

  it("derives attribution from the description", () => {
    const actor = parseAttackBundle(bundle)[0];
    expect(actor.actorType).toBe("State Sponsored");
    expect(actor.origin).toBe("China");
    expect(actor.targetSectors).toContain("Government");
    expect(actor.targetSectors).toContain("Telecommunications");
    expect(actor.targetRegions).toContain("North America");
    expect(actor.targetRegions).toContain("East Asia");
  });

  it("derives targeted technologies from the description", () => {
    const actors = parseAttackBundle([
      {
        id: "intrusion-set--tech",
        type: "intrusion-set",
        name: "APT-Tech",
        description:
          "The group exploited Microsoft Exchange servers and Log4j, then pivoted through Citrix NetScaler and VMware ESXi hosts.",
        external_references: [{ source_name: "mitre-attack", external_id: "G9998" }],
      },
    ]);
    expect(actors[0].targetTechnologies).toEqual(
      expect.arrayContaining(["Microsoft Exchange", "Citrix", "VMware / ESXi", "Apache / Log4j"])
    );
  });
});

describe("classifyActorType", () => {
  it("detects financially motivated groups", () => {
    expect(classifyActorType("A financially motivated group deploying ransomware.")).toBe("Cybercrime");
  });

  it("detects hacktivists", () => {
    expect(classifyActorType("A hacktivist collective.")).toBe("Hacktivist");
  });

  it("returns null when the description gives no signal", () => {
    expect(classifyActorType("A group that has been observed since 2015.")).toBeNull();
  });
});

describe("deriveAttribution", () => {
  it("returns empty collections when nothing matches", () => {
    const result = deriveAttribution("No useful signal here.");
    expect(result).toEqual({
      actorType: null,
      origin: null,
      targetSectors: [],
      targetRegions: [],
      targetTechnologies: [],
    });
  });
});
