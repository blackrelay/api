import { describe, expect, it } from "vitest";
import { dedupeCurrentCharacters } from "../src/current";

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
});
