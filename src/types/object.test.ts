import { describe, expect, it } from "vitest";

import {
  dataLinkSchema,
  evoUserLikeSchema,
  geoscienceObjectEnvelopeSchema,
  geoscienceObjectSummarySchema,
  geoscienceObjectVersionEntrySchema,
  stageSchema,
} from "./object";
import type {
  DataLink,
  GeoscienceObjectEnvelope,
  GeoscienceObjectSummary,
  Stage,
} from "./object";
import { parseObjectId, parseStageId, parseVersionId } from "./ids";
import type { ObjectId, StageId, VersionId } from "./ids";

const OBJECT_UUID = "550e8400-e29b-41d4-a716-446655440000";
const STAGE_UUID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "22222222-2222-4222-8222-222222222222";
const BLOB_UUID = "33333333-3333-4333-8333-333333333333";

describe("evoUserLikeSchema", () => {
  it("parses a full user", () => {
    const parsed = evoUserLikeSchema.parse({
      id: USER_UUID,
      name: "Ada",
      email: "ada@example.com",
    });
    expect(parsed).toEqual({
      id: USER_UUID,
      name: "Ada",
      email: "ada@example.com",
    });
  });

  it("normalises missing/null name and email to null", () => {
    const parsed = evoUserLikeSchema.parse({
      id: USER_UUID,
      name: null,
    });
    expect(parsed.name).toBeNull();
    expect(parsed.email).toBeNull();
  });

  it("rejects when id is missing", () => {
    expect(() => evoUserLikeSchema.parse({ name: "no-id" })).toThrow();
  });
});

describe("stageSchema", () => {
  it("transforms snake_case wire shape to camelCase", () => {
    const parsed: Stage = stageSchema.parse({
      stage_id: STAGE_UUID,
      name: "Approved",
    });
    expect(parsed).toEqual({ stageId: STAGE_UUID, name: "Approved" });
  });

  it("rejects when stage_id missing", () => {
    expect(() => stageSchema.parse({ name: "Approved" })).toThrow();
  });

  it("rejects when stage_id is not a UUID", () => {
    expect(() =>
      stageSchema.parse({ stage_id: "not-a-uuid", name: "x" }),
    ).toThrow();
  });

  it("yields a value assignable as StageId", () => {
    const parsed = stageSchema.parse({
      stage_id: STAGE_UUID,
      name: "Approved",
    });
    const stageId: StageId = parsed.stageId;
    expect(stageId).toBe(parseStageId(STAGE_UUID));
  });
});

describe("dataLinkSchema", () => {
  it("camelCases download_url", () => {
    const parsed: DataLink = dataLinkSchema.parse({
      id: BLOB_UUID,
      name: "deadbeef".repeat(8),
      download_url: "https://example.com/blob",
    });
    expect(parsed).toEqual({
      id: BLOB_UUID,
      name: "deadbeef".repeat(8),
      downloadUrl: "https://example.com/blob",
    });
  });

  it("normalises missing/null download_url to null", () => {
    const parsed = dataLinkSchema.parse({
      id: BLOB_UUID,
      name: "abc",
    });
    expect(parsed.downloadUrl).toBeNull();
  });

  it("rejects when required fields are missing", () => {
    expect(() => dataLinkSchema.parse({ name: "no-id" })).toThrow();
  });
});

const summaryFixture = (): unknown => ({
  object_id: OBJECT_UUID,
  name: "pointset.json",
  path: "geology/pointset.json",
  schema: "/objects/pointset/1.0.1/pointset.schema.json",
  version_id: "1700000000000",
  etag: "abc123",
  created_at: "2024-01-01T00:00:00Z",
  created_by: { id: USER_UUID, name: "Ada", email: "ada@example.com" },
  modified_at: "2024-01-02T00:00:00Z",
  modified_by: null,
  // future server-added field — must pass through silently
  geojson_bounding_box: null,
  geojson_bounding_box_from_workspace_crs: false,
});

describe("geoscienceObjectSummarySchema", () => {
  it("parses a representative wire shape into camelCase", () => {
    const parsed: GeoscienceObjectSummary = geoscienceObjectSummarySchema.parse(
      summaryFixture(),
    );
    expect(parsed.objectId).toBe(parseObjectId(OBJECT_UUID));
    expect(parsed.name).toBe("pointset.json");
    expect(parsed.path).toBe("geology/pointset.json");
    expect(parsed.versionId).toBe(parseVersionId("1700000000000"));
    expect(parsed.createdBy?.name).toBe("Ada");
    expect(parsed.modifiedBy).toBeNull();
    expect(parsed.deletedAt).toBeNull();
    expect(parsed.stage).toBeNull();
  });

  it("rejects when a required field is missing", () => {
    const fixture = summaryFixture() as Record<string, unknown>;
    delete fixture.object_id;
    expect(() => geoscienceObjectSummarySchema.parse(fixture)).toThrow();
  });

  it("yields a value assignable as ObjectId/VersionId", () => {
    const parsed = geoscienceObjectSummarySchema.parse(summaryFixture());
    const objectId: ObjectId = parsed.objectId;
    const versionId: VersionId = parsed.versionId;
    expect(objectId).toBe(parseObjectId(OBJECT_UUID));
    expect(versionId).toBe(parseVersionId("1700000000000"));
  });
});

const envelopeFixture = (overrides: Record<string, unknown> = {}): unknown => ({
  object_id: OBJECT_UUID,
  object_path: "geology/pointset.json",
  version_id: "1700000000000",
  etag: "etag-1",
  created_at: "2024-01-01T00:00:00Z",
  created_by: { id: USER_UUID, name: "Ada", email: null },
  modified_at: "2024-01-02T00:00:00Z",
  modified_by: { id: USER_UUID, name: "Ada", email: null },
  links: {
    download: "https://example.com/object.json",
    data: [
      {
        id: BLOB_UUID,
        name: "deadbeef".repeat(8),
        download_url: "https://example.com/blob",
      },
    ],
  },
  object: {
    schema: "/objects/pointset/1.0.1/pointset.schema.json",
    uuid: OBJECT_UUID,
    name: "pointset",
  },
  ...overrides,
});

describe("geoscienceObjectVersionEntrySchema", () => {
  it("parses a version entry", () => {
    const parsed = geoscienceObjectVersionEntrySchema.parse({
      version_id: "1700000000000",
      created_at: "2024-01-01T00:00:00Z",
      created_by: { id: USER_UUID, name: "Ada" },
      etag: "etag-x",
    });
    expect(parsed.versionId).toBe(parseVersionId("1700000000000"));
    expect(parsed.stage).toBeNull();
  });

  it("rejects missing version_id", () => {
    expect(() =>
      geoscienceObjectVersionEntrySchema.parse({
        created_at: "2024-01-01T00:00:00Z",
        etag: "x",
      }),
    ).toThrow();
  });
});

describe("geoscienceObjectEnvelopeSchema", () => {
  it("parses a representative wire shape into camelCase", () => {
    const parsed: GeoscienceObjectEnvelope =
      geoscienceObjectEnvelopeSchema.parse(envelopeFixture());
    expect(parsed.objectId).toBe(parseObjectId(OBJECT_UUID));
    expect(parsed.path).toBe("geology/pointset.json");
    expect(parsed.schema).toBe(
      "/objects/pointset/1.0.1/pointset.schema.json",
    );
    expect(parsed.versionId).toBe(parseVersionId("1700000000000"));
    expect(parsed.links.data?.[0]?.downloadUrl).toBe(
      "https://example.com/blob",
    );
    expect(parsed.versions).toBeUndefined();
  });

  it("includes versions when present", () => {
    const parsed = geoscienceObjectEnvelopeSchema.parse(
      envelopeFixture({
        versions: [
          {
            version_id: "1700000000000",
            created_at: "2024-01-01T00:00:00Z",
            etag: "etag-v",
          },
        ],
      }),
    );
    expect(parsed.versions).toHaveLength(1);
    expect(parsed.versions?.[0]?.versionId).toBe(
      parseVersionId("1700000000000"),
    );
  });

  it("accepts arbitrary object body shapes (object literal, array, null)", () => {
    const literal = geoscienceObjectEnvelopeSchema.parse(
      envelopeFixture({ object: { schema: "x", anything: { goes: true } } }),
    );
    expect(literal.object).toEqual({
      schema: "x",
      anything: { goes: true },
    });

    const arr = geoscienceObjectEnvelopeSchema.parse(
      envelopeFixture({ object: [1, 2, 3] }),
    );
    expect(arr.object).toEqual([1, 2, 3]);
    // No `schema` field on an array body — falls back to empty string.
    expect(arr.schema).toBe("");

    const nullBody = geoscienceObjectEnvelopeSchema.parse(
      envelopeFixture({ object: null }),
    );
    expect(nullBody.object).toBeNull();
    expect(nullBody.schema).toBe("");
  });

  it("treats links.data as optional", () => {
    const parsed = geoscienceObjectEnvelopeSchema.parse(
      envelopeFixture({
        links: { download: "https://example.com/object.json" },
      }),
    );
    expect(parsed.links.data).toBeUndefined();
    expect(parsed.links.download).toBe("https://example.com/object.json");
  });

  it("rejects when a required envelope field is missing", () => {
    const fixture = envelopeFixture() as Record<string, unknown>;
    delete fixture.object_id;
    expect(() => geoscienceObjectEnvelopeSchema.parse(fixture)).toThrow();
  });

  it("preserves unknown server-added top-level fields (forward compat)", () => {
    // .loose() means parse won't fail when new fields appear.
    expect(() =>
      geoscienceObjectEnvelopeSchema.parse(
        envelopeFixture({ a_new_field_from_the_future: 42 }),
      ),
    ).not.toThrow();
  });
});
