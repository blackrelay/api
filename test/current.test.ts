import { describe, expect, it } from "vitest";
import { dedupeCurrentCharacters, dedupeCurrentTribes, needsTribeLabelRepair, repairCurrentTribeLabels } from "../src/current";

describe("current entity normalisation", () => {
  it("collapses duplicate character identities and keeps relations for the winning row", () => {
    const rows = [
      {
        entity: {
          id: "character:stillness:2112092421",
          entityType: "character",
          displayName: "Hei Warden",
          environment: "stillness",
          cycle: 6,
          updatedAt: "2026-06-27T13:12:29.311813Z"
        },
        facts: {
          character_address: "0xdff1ca19cea48a7d452cd0d79ebed10398bb90178aa7d2a4726e99e3344b5c78",
          object_id: "0xlegacy"
        },
        outgoingRelations: [
          {
            id: "relation:legacy",
            subjectEntityId: "character:stillness:2112092421",
            predicate: "belongs_to",
            objectEntityId: "tribe:stillness:1000167"
          }
        ],
        sourceIds: ["source:sui:sui-testnet:graphql:objects"]
      },
      {
        entity: {
          id: "character:stillness:2112092610",
          entityType: "character",
          displayName: "Hei Warden",
          environment: "stillness",
          cycle: 6,
          updatedAt: "2026-06-27T11:08:46.577316Z"
        },
        facts: {
          character_address: "0xdff1ca19cea48a7d452cd0d79ebed10398bb90178aa7d2a4726e99e3344b5c78",
          source_event_kind: "character.created",
          source_event_id: "event:character-created"
        },
        outgoingRelations: [
          {
            id: "relation:event",
            subjectEntityId: "character:stillness:2112092610",
            predicate: "belongs_to",
            objectEntityId: "tribe:stillness:1000167"
          }
        ],
        sourceIds: ["source:sui:sui-testnet:graphql"]
      }
    ];

    const deduped = dedupeCurrentCharacters(rows);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].entity.id).toBe("character:stillness:2112092610");
    expect(deduped[0].facts.object_id).toBe("0xlegacy");
    expect(deduped[0].sourceIds).toEqual(["source:sui:sui-testnet:graphql", "source:sui:sui-testnet:graphql:objects"]);
    expect(deduped[0].outgoingRelations.map((relation) => relation.subjectEntityId)).toEqual(["character:stillness:2112092610"]);
  });

  it("collapses duplicate tribe identities and prefers named public profile rows", () => {
    const rows = [
      {
        entity: {
          id: "tribe:stillness:1000167",
          entityType: "tribe",
          displayName: "Clonebank 86",
          environment: "stillness",
          cycle: 6,
          updatedAt: "2026-06-28T10:30:45.105Z"
        },
        facts: {
          tribe_id: "1000167",
          tag: "CO86"
        },
        sourceIds: ["source:world-api:tribes"]
      },
      {
        entity: {
          id: "tribe:liminality:1000167",
          entityType: "tribe",
          displayName: "Tribe 1000167",
          environment: "stillness",
          cycle: 6,
          updatedAt: "2026-06-27T11:08:46.577316Z"
        },
        facts: {
          tribe_id: "1000167",
          source_event_kind: "character.created"
        },
        incomingRelations: [
          {
            id: "relation:character:liminality:2112000001:belongs_to:tribe:liminality:1000167",
            subjectEntityId: "character:liminality:2112000001",
            subjectEntityType: "character",
            subjectDisplayName: "fingolfin",
            predicate: "belongs_to",
            objectEntityId: "tribe:liminality:1000167",
            objectEntityType: "tribe",
            objectDisplayName: "Tribe 1000167"
          }
        ],
        sourceIds: ["source:sui:sui-testnet:graphql"]
      }
    ];

    const deduped = dedupeCurrentTribes(rows);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].entity.id).toBe("tribe:stillness:1000167");
    expect(deduped[0].entity.displayName).toBe("Clonebank 86");
    expect(deduped[0].facts.source_event_kind).toBe("character.created");
    expect(deduped[0].sourceIds).toEqual(["source:sui:sui-testnet:graphql", "source:world-api:tribes"]);
  });

  it("repairs embedded placeholder tribe labels from current tribe metadata", () => {
    const rows = [
      {
        entity: {
          id: "character:stillness:2112093154",
          entityType: "character",
          displayName: "0-XFL-4Y3D",
          environment: "stillness",
          cycle: 6
        },
        derived: {
          tribe: {
            entityId: "tribe:stillness:1000167",
            entityType: "tribe",
            displayName: "Tribe 1000167"
          }
        },
        outgoingRelations: [
          {
            subjectEntityId: "character:stillness:2112093154",
            subjectEntityType: "character",
            subjectDisplayName: "0-XFL-4Y3D",
            predicate: "belongs_to",
            objectEntityId: "tribe:stillness:1000167",
            objectEntityType: "tribe",
            objectDisplayName: "Tribe 1000167"
          }
        ]
      }
    ];
    const tribeRows = [
      {
        entity: {
          id: "tribe:stillness:1000167",
          entityType: "tribe",
          displayName: "Clonebank 86",
          environment: "stillness",
          cycle: 6
        },
        facts: {
          tribe_id: "1000167"
        }
      }
    ];

    expect(needsTribeLabelRepair(rows)).toBe(true);
    const repaired = repairCurrentTribeLabels(rows, tribeRows);

    expect(repaired[0].derived.tribe.displayName).toBe("Clonebank 86");
    expect(repaired[0].outgoingRelations[0].objectDisplayName).toBe("Clonebank 86");
  });
});
