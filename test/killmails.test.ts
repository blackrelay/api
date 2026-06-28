import { describe, expect, it } from "vitest";
import { collectKillmailEntityIDs, enrichKillmailRecords } from "../src/killmails";

describe("killmail list normalisation", () => {
  it("collects actor and system entity IDs needed for list display", () => {
    expect(
      collectKillmailEntityIDs([
        {
          id: "killmail:stillness:3288",
          environment: "stillness",
          systemId: "system:stillness:30017427",
          victimCharacterId: "character:stillness:2112093272",
          killerCharacterId: "character:stillness:2112092729",
          reporterCharacterId: "character:stillness:2112092729"
        }
      ])
    ).toEqual(["character:stillness:2112092729", "character:stillness:2112093272", "system:stillness:30017427"]);
  });

  it("adds semantic display names to raw killmail list rows", () => {
    const [killmail] = enrichKillmailRecords(
      [
        {
          id: "killmail:stillness:3288",
          environment: "stillness",
          systemId: "system:stillness:30017427",
          victimCharacterId: "character:stillness:2112093272",
          killerCharacterId: "character:stillness:2112092729"
        }
      ],
      new Map([
        [
          "system:stillness:30017427",
          { id: "system:stillness:30017427", entityType: "system", displayName: "UL7-30L" }
        ],
        [
          "character:stillness:2112093272",
          { id: "character:stillness:2112093272", entityType: "character", displayName: "silviu bv" }
        ],
        ["character:stillness:2112092729", { id: "character:stillness:2112092729", entityType: "character", displayName: "Asterix" }]
      ])
    ) as [Record<string, unknown>];

    expect(killmail.systemName).toBe("UL7-30L");
    expect(killmail.victimName).toBe("silviu bv");
    expect(killmail.killerName).toBe("Asterix");
    expect(killmail.system).toMatchObject({ displayName: "UL7-30L", entityType: "system" });
    expect(killmail.victim).toMatchObject({ displayName: "silviu bv", entityType: "character" });
    expect(killmail.killer).toMatchObject({ displayName: "Asterix", entityType: "character" });
  });
});
