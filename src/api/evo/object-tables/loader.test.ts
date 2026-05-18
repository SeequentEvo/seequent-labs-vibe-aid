import { describe, it, expect, afterEach } from "vitest";
import { vi } from "vitest";
import { tableFromArrays, tableToIPC } from "apache-arrow";
import { Table as PqTable } from "parquet-wasm/esm";

import {
  InMemoryBlobStore,
  asBlobRef,
  encodeParquet,
  sha256Hex,
  type BlobRef,
  type CacheScope,
} from "@/api/evo/blob";
import {
  parseObjectId,
  parseOrgId,
  parseVersionId,
  parseWorkspaceId,
} from "@/types/ids";
import type { GeoscienceObjectEnvelope } from "@/types/object";

import { wasNoData } from "./column-meta";
import { describeObject, loadAttachment } from "./index";
import type { LoadDeps, SchemaDescriptor, SupportedObjectDescription } from "./index";
import * as registry from "./schemas/registry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const scope: CacheScope = {
  orgId: parseOrgId("11111111-1111-4111-8111-111111111111"),
  workspaceId: parseWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
  kind: "geoscience-object",
};

async function makeBlob(
  data: Record<string, Float64Array | Int32Array | string[] | boolean[]>,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; ref: BlobRef }> {
  const arrow = tableFromArrays(data);
  const ipc = tableToIPC(arrow, "stream");
  const pq = PqTable.fromIPCStream(ipc);
  const bytes = await encodeParquet(pq);
  // Re-wrap to satisfy TS strict ArrayBuffer/SharedArrayBuffer split.
  const buf = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  buf.set(bytes);
  const hash = await sha256Hex(buf);
  return { bytes: buf, ref: asBlobRef(hash) };
}

function makeEnvelope(
  schema: string,
  object: unknown,
  dataLinks: { name: string; downloadUrl: string }[],
): GeoscienceObjectEnvelope {
  return {
    objectId: parseObjectId("22222222-2222-4222-8222-222222222222"),
    path: null,
    schema,
    versionId: parseVersionId("v1"),
    etag: '"etag"',
    createdAt: "2024-01-01T00:00:00Z",
    createdBy: null,
    modifiedAt: "2024-01-01T00:00:00Z",
    modifiedBy: null,
    deletedAt: null,
    deletedBy: null,
    stage: null,
    object,
    links: {
      data: dataLinks.map((l) => ({ id: l.name, ...l })),
    },
  };
}

// ---------------------------------------------------------------------------
// describeObject
// ---------------------------------------------------------------------------

describe("describeObject", () => {
  it("describes a supported pointset", () => {
    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 3,
            data: "coord-hash",
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: { data_type: "float64", length: 3, data: "grade-hash" },
              nan_description: { values: [] },
            },
            {
              key: "rock_type",
              name: "Rock Type",
              attribute_type: "category",
              values: {
                data_type: "int32",
                length: 3,
                data: "rock-values-hash",
              },
              table: {
                keys_data_type: "int32",
                values_data_type: "string",
                length: 2,
                data: "rock-lookup-hash",
              },
            },
          ],
        },
      },
      [],
    );

    const desc = describeObject(envelope);

    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("pointset");
    expect(supported.attachments).toHaveLength(1);

    const att = supported.attachments[0]!;
    expect(att.id).toBe("locations");
    expect(att.rowCount).toBe(3);

    // Identity: 3 columns (x, y, z)
    expect(att.identity).not.toBeNull();
    expect(att.identity!.columns).toEqual(["x", "y", "z"]);

    // 2 attributes: scalar + category
    expect(att.attributes).toHaveLength(2);
    expect(att.attributes[0]!.name).toBe("Grade");
    expect(att.attributes[0]!.kind).toEqual({ decoded: true, type: "scalar" });
    expect(att.attributes[1]!.name).toBe("Rock Type");
    expect(att.attributes[1]!.kind).toEqual({ decoded: true, type: "category" });
  });

  it("describes unsupported attribute types with decoded: false and populated attributeData", () => {
    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 2,
            data: "coord-hash",
          },
          attributes: [
            {
              key: "ensemble",
              name: "Ensemble",
              attribute_type: "continuous-ensemble",
              values: { data_type: "float64", length: 2, data: "ensemble-hash" },
            },
          ],
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attr = supported.attachments[0]!.attributes[0]!;

    expect(attr.kind).toEqual({ decoded: false, type: "continuous-ensemble" });
    expect(attr.columns).toEqual([]);
    expect(attr.nanDescription).toBeNull();
    expect(attr.attributeData).toEqual({ kind: "blob", blobs: ["ensemble-hash"] });
  });

  it("returns unsupported for unknown schemas", () => {
    const envelope = makeEnvelope(
      "/objects/unknown/1.0.0/unknown.schema.json",
      {},
      [],
    );

    const desc = describeObject(envelope);

    expect(desc.kind).toBe("unsupported");
    if (desc.kind === "unsupported") {
      expect(desc.reason).toBe("no-descriptor");
    }
  });

  it("returns unsupported for pointset major version 2", () => {
    const envelope = makeEnvelope(
      "/objects/pointset/2.0.0/pointset.schema.json",
      {},
      [],
    );

    const desc = describeObject(envelope);

    expect(desc.kind).toBe("unsupported");
    if (desc.kind === "unsupported") {
      expect(desc.reason).toBe("no-descriptor");
    }
  });

  it("describes a pointset with data: null identity as empty", () => {
    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            data: null,
            length: 0,
            width: 3,
            data_type: "float64",
          },
          attributes: [],
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const att = supported.attachments[0]!;

    expect(att.identity).not.toBeNull();
    expect(att.identity!.kind).toBe("empty");
    expect(att.rowCount).toBe(0);
    expect(att.identity!.columns).toEqual(["x", "y", "z"]);
  });

  it("collects envelope errors for data: null with length > 0", () => {
    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            data: null,
            length: 5,
            width: 3,
            data_type: "float64",
          },
          attributes: [],
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const att = supported.attachments[0]!;

    expect(att.identity).toBeNull();
    expect(att.envelopeErrors.length).toBe(1);
    expect(att.envelopeErrors[0]!.message).toMatch(/length 5 > 0/);
  });

  it("describes attributes with data: null as empty attributeData", () => {
    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            data: null,
            length: 0,
            width: 3,
            data_type: "float64",
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: { data: null, length: 0, data_type: "float64" },
              nan_description: { values: [] },
            },
          ],
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attr = supported.attachments[0]!.attributes[0]!;

    expect(attr.attributeData.kind).toBe("empty");
  });
});

// ---------------------------------------------------------------------------
// loadAttachment — full round-trip
// ---------------------------------------------------------------------------

describe("loadAttachment", () => {
  it("loads a pointset with identity, scalar, and category attributes", async () => {
    // 1. Build Parquet blobs
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2, 3]),
      col1: Float64Array.from([4, 5, 6]),
      col2: Float64Array.from([7, 8, 9]),
    });

    const gradeBlob = await makeBlob({
      col0: Float64Array.from([10.5, 20.5, 30.5]),
    });

    const rockValuesBlob = await makeBlob({
      col0: Int32Array.from([0, 1, 0]),
    });

    const rockLookupBlob = await makeBlob({
      col0: Int32Array.from([0, 1]),
      col1: ["Granite", "Basalt"],
    });

    // 2. Pre-populate InMemoryBlobStore
    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, gradeBlob.ref, gradeBlob.bytes);
    await store.put(scope, rockValuesBlob.ref, rockValuesBlob.bytes);
    await store.put(scope, rockLookupBlob.ref, rockLookupBlob.bytes);

    // 3. Build envelope
    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 3,
            data: coordBlob.ref,
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: {
                data_type: "float64",
                length: 3,
                data: gradeBlob.ref,
              },
              nan_description: { values: [] },
            },
            {
              key: "rock_type",
              name: "Rock Type",
              attribute_type: "category",
              values: {
                data_type: "int32",
                length: 3,
                data: rockValuesBlob.ref,
              },
              table: {
                keys_data_type: "int32",
                values_data_type: "string",
                length: 2,
                data: rockLookupBlob.ref,
              },
            },
          ],
        },
      },
      [coordBlob, gradeBlob, rockValuesBlob, rockLookupBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    // 4. Describe + load
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    // 5. Verify table shape
    const { table, errors } = result;
    expect(errors).toEqual([]);
    expect(table.numRows).toBe(3);

    // Columns: x, y, z, Grade, Rock Type
    const colNames = table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual([
      "x",
      "y",
      "z",
      "Grade",
      "Rock Type",
    ]);

    // 6. Verify identity values
    expect(table.getChildAt(0)?.toArray()).toEqual(Float64Array.from([1, 2, 3]));
    expect(table.getChildAt(1)?.toArray()).toEqual(Float64Array.from([4, 5, 6]));
    expect(table.getChildAt(2)?.toArray()).toEqual(Float64Array.from([7, 8, 9]));

    // 7. Verify scalar attribute values
    expect(table.getChildAt(3)?.toArray()).toEqual(
      Float64Array.from([10.5, 20.5, 30.5]),
    );

    // 8. Verify category labels (single label column, integer codes not exposed)
    const rockCol = table.getChildAt(4);
    expect(rockCol?.get(0)).toBe("Granite");
    expect(rockCol?.get(1)).toBe("Basalt");
    expect(rockCol?.get(2)).toBe("Granite");
  });

  it("applies sentinel substitution from nan_description values", async () => {
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2]),
      col1: Float64Array.from([3, 4]),
      col2: Float64Array.from([5, 6]),
    });

    const gradeBlob = await makeBlob({
      col0: Float64Array.from([10.5, -999]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, gradeBlob.ref, gradeBlob.bytes);

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 2,
            data: coordBlob.ref,
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: {
                data_type: "float64",
                length: 2,
                data: gradeBlob.ref,
              },
              nan_description: { values: [-999] },
            },
          ],
        },
      },
      [coordBlob, gradeBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    // Grade column: -999 should be replaced with null
    const gradeCol = result.table.getChildAt(3);
    expect(gradeCol?.get(0)).toBe(10.5);
    expect(gradeCol?.get(1)).toBeNull();

    expect(result.errors).toEqual([]);
  });

  it("throws on data_type mismatch between JSON schema and Parquet blob", async () => {
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2]),
      col1: Float64Array.from([3, 4]),
      col2: Float64Array.from([5, 6]),
    });

    // Grade blob uses float64 data, but JSON declares int64
    const gradeBlob = await makeBlob({
      col0: Float64Array.from([10.5, 20.5]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, gradeBlob.ref, gradeBlob.bytes);

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 2,
            data: coordBlob.ref,
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: {
                data_type: "int64",
                length: 2,
                data: gradeBlob.ref,
              },
            },
          ],
        },
      },
      [coordBlob, gradeBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    // Validation error captured per-attribute, not thrown
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.attributeName).toBe("Grade");
    expect(result.errors[0]!.message).toMatch(/Data integrity error.*Grade.*int64.*float64/);
  });

  it("passes validation when Parquet schema matches declared types", async () => {
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2]),
      col1: Float64Array.from([3, 4]),
      col2: Float64Array.from([5, 6]),
    });

    const gradeBlob = await makeBlob({
      col0: Float64Array.from([10.5, 20.5]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, gradeBlob.ref, gradeBlob.bytes);

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 2,
            data: coordBlob.ref,
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: {
                data_type: "float64",
                length: 2,
                data: gradeBlob.ref,
              },
            },
          ],
        },
      },
      [coordBlob, gradeBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    // Should not throw
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });
    expect(result.table.numRows).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Selective attribute loading
// ---------------------------------------------------------------------------

describe("loadAttachment — selective attributes", () => {
  async function buildPointsetFixture() {
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2, 3]),
      col1: Float64Array.from([4, 5, 6]),
      col2: Float64Array.from([7, 8, 9]),
    });

    const gradeBlob = await makeBlob({
      col0: Float64Array.from([10.5, 20.5, 30.5]),
    });

    const rockValuesBlob = await makeBlob({
      col0: Int32Array.from([0, 1, 0]),
    });

    const rockLookupBlob = await makeBlob({
      col0: Int32Array.from([0, 1]),
      col1: ["Granite", "Basalt"],
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, gradeBlob.ref, gradeBlob.bytes);
    await store.put(scope, rockValuesBlob.ref, rockValuesBlob.bytes);
    await store.put(scope, rockLookupBlob.ref, rockLookupBlob.bytes);

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 3,
            data: coordBlob.ref,
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: {
                data_type: "float64",
                length: 3,
                data: gradeBlob.ref,
              },
              nan_description: { values: [] },
            },
            {
              key: "rock_type",
              name: "Rock Type",
              attribute_type: "category",
              values: {
                data_type: "int32",
                length: 3,
                data: rockValuesBlob.ref,
              },
              table: {
                keys_data_type: "int32",
                values_data_type: "string",
                length: 2,
                data: rockLookupBlob.ref,
              },
            },
          ],
        },
      },
      [coordBlob, gradeBlob, rockValuesBlob, rockLookupBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    return { store, envelope, attachment };
  }

  it("loads identity-only table with { kind: 'none' }", async () => {
    const { store, envelope, attachment } = await buildPointsetFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "none" },
    });

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z"]);
    expect(result.table.numRows).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it("loads identity + selected attribute with { kind: 'keys' }", async () => {
    const { store, envelope, attachment } = await buildPointsetFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "keys", keys: ["grade"] },
    });

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z", "Grade"]);
    expect(result.table.numRows).toBe(3);
    expect(result.table.getChildAt(3)?.toArray()).toEqual(
      Float64Array.from([10.5, 20.5, 30.5]),
    );
    expect(result.errors).toEqual([]);
  });

  it("loads identity + all attributes with { kind: 'all' }", async () => {
    const { store, envelope, attachment } = await buildPointsetFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z", "Grade", "Rock Type"]);
    expect(result.table.numRows).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it("throws on unknown attribute key before any I/O", async () => {
    const { store, envelope, attachment } = await buildPointsetFixture();
    const deps: LoadDeps = { store, scope };

    await expect(
      loadAttachment(attachment, envelope, deps, {
        attributes: { kind: "keys", keys: ["nonexistent"] },
      }),
    ).rejects.toThrow(/Unknown attribute key\(s\).*"nonexistent"/);
  });

  it("reuses cached blobs when loading additional attributes", async () => {
    const { store, envelope, attachment } = await buildPointsetFixture();
    const deps: LoadDeps = { store, scope };

    const result1 = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "keys", keys: ["grade"] },
    });
    expect(result1.table.schema.fields.map((f) => f.name)).toEqual([
      "x", "y", "z", "Grade",
    ]);

    const result2 = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "keys", keys: ["grade", "rock_type"] },
    });
    const colNames = result2.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z", "Grade", "Rock Type"]);
    expect(result2.table.numRows).toBe(3);
    expect(result2.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Boolean attribute round-trip
// ---------------------------------------------------------------------------

describe("loadAttachment — boolean attribute", () => {
  it("loads a bool attribute and validates the Parquet schema", async () => {
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2, 3]),
      col1: Float64Array.from([4, 5, 6]),
      col2: Float64Array.from([7, 8, 9]),
    });

    const boolBlob = await makeBlob({
      col0: [true, false, true],
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, boolBlob.ref, boolBlob.bytes);

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 3,
            data: coordBlob.ref,
          },
          attributes: [
            {
              key: "polarity",
              name: "Plane Polarity",
              attribute_type: "bool",
              values: {
                data_type: "bool",
                length: 3,
                data: boolBlob.ref,
              },
            },
          ],
        },
      },
      [coordBlob, boolBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    expect(attachment.attributes[0]!.kind).toEqual({
      decoded: true,
      type: "bool",
    });

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    expect(result.errors).toEqual([]);
    expect(result.table.numRows).toBe(3);

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z", "Plane Polarity"]);

    const boolCol = result.table.getChildAt(3);
    expect(boolCol?.get(0)).toBe(true);
    expect(boolCol?.get(1)).toBe(false);
    expect(boolCol?.get(2)).toBe(true);
  });

  it("rejects data_type mismatch for bool attribute", async () => {
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2]),
      col1: Float64Array.from([3, 4]),
      col2: Float64Array.from([5, 6]),
    });

    // Float64 blob declared as bool — should produce validation error
    const mismatchBlob = await makeBlob({
      col0: Float64Array.from([1, 0]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, mismatchBlob.ref, mismatchBlob.bytes);

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            width: 3,
            data_type: "float64",
            length: 2,
            data: coordBlob.ref,
          },
          attributes: [
            {
              key: "polarity",
              name: "Polarity",
              attribute_type: "bool",
              values: {
                data_type: "bool",
                length: 2,
                data: mismatchBlob.ref,
              },
            },
          ],
        },
      },
      [coordBlob, mismatchBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.attributeName).toBe("Polarity");
    expect(result.errors[0]!.message).toMatch(/Data integrity error.*Polarity.*bool.*float64/);
  });
});

// ---------------------------------------------------------------------------
// describeObject — propertiesView extraction
// ---------------------------------------------------------------------------

describe("describeObject — propertiesView", () => {
  function withMockDescriptor(descriptor: SchemaDescriptor, fn: () => void) {
    const spy = vi.spyOn(registry, "lookupDescriptor").mockReturnValue(descriptor);
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
  }

  it("extracts a subtree at a specified path", () => {
    const descriptor: SchemaDescriptor = {
      family: "test-params",
      matches: () => true,
      attachments: [],
      propertiesView: { path: ["params"] },
    };

    const envelope = makeEnvelope(
      "/objects/test/1.0.0/test.schema.json",
      { params: { range: 100, sill: 42 }, other: "ignored" },
      [],
    );

    withMockDescriptor(descriptor, () => {
      const desc = describeObject(envelope);
      expect(desc.kind).toBe("supported");
      const supported = desc as SupportedObjectDescription;
      expect(supported.propertiesData).toEqual({ range: 100, sill: 42 });
    });
  });

  it("extracts the entire body when path is empty", () => {
    const body = { alpha: 1, beta: "two", nested: { c: 3 } };
    const descriptor: SchemaDescriptor = {
      family: "test-full",
      matches: () => true,
      attachments: [],
      propertiesView: { path: [] },
    };

    const envelope = makeEnvelope(
      "/objects/test/1.0.0/test.schema.json",
      body,
      [],
    );

    withMockDescriptor(descriptor, () => {
      const desc = describeObject(envelope);
      expect(desc.kind).toBe("supported");
      const supported = desc as SupportedObjectDescription;
      expect(supported.propertiesData).toEqual(body);
    });
  });

  it("omits propertiesData when descriptor has no propertiesView", () => {
    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: { data_type: "float64", length: 0, data: "abc" },
          attributes: [],
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.propertiesData).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Schema column groups
// ---------------------------------------------------------------------------

import {
  getColumnRole,
  getSchemaColumnGroupId,
  type SchemaColumnBlueprint,
} from "./index";

describe("describeObject — schemaColumns", () => {
  function withMockSchemaColumnDescriptor(
    schemaColumns: readonly SchemaColumnBlueprint[],
    objectBody: unknown,
    fn: (desc: SupportedObjectDescription) => void,
  ) {
    const descriptor: SchemaDescriptor = {
      family: "test-schema-cols",
      matches: () => true,
      attachments: [
        {
          id: "locations",
          jsonPath: ["locations"],
          identityFrom: { path: ["coordinates"], columns: ["x", "y", "z"] },
          schemaColumns,
        },
      ],
    };

    const spy = vi.spyOn(registry, "lookupDescriptor").mockReturnValue(descriptor);
    try {
      const envelope = makeEnvelope(
        "/objects/test/1.0.0/test.schema.json",
        objectBody,
        [],
      );
      const desc = describeObject(envelope);
      expect(desc.kind).toBe("supported");
      fn(desc as SupportedObjectDescription);
    } finally {
      spy.mockRestore();
    }
  }

  it("resolves schema column groups from JSON", () => {
    withMockSchemaColumnDescriptor(
      [
        {
          id: "lineations",
          label: "Lineations",
          path: ["lineation_data"],
          columns: ["trend", "plunge"],
        },
      ],
      {
        locations: {
          coordinates: { width: 3, data_type: "float64", length: 4, data: "coord-hash" },
          lineation_data: { width: 2, data_type: "float64", length: 4, data: "lin-hash" },
          attributes: [],
        },
      },
      (supported) => {
        const att = supported.attachments[0]!;
        expect(att.schemaColumns).toHaveLength(1);
        const group = att.schemaColumns[0]!;
        expect(group.id).toBe("lineations");
        expect(group.label).toBe("Lineations");
        expect(group.columns).toEqual(["trend", "plunge"]);
        if (group.kind !== "blob") throw new Error("expected blob descriptor");
        expect(group.blobRef).toBe("lin-hash");
        expect(group.rowCount).toBe(4);
        expect(group.elementSchema).toEqual({ dataType: "float64", width: 2 });
      },
    );
  });

  it("returns empty schemaColumns when blueprint has none", () => {
    withMockSchemaColumnDescriptor(
      [],
      {
        locations: {
          coordinates: { width: 3, data_type: "float64", length: 2, data: "coord-hash" },
          attributes: [],
        },
      },
      (supported) => {
        expect(supported.attachments[0]!.schemaColumns).toEqual([]);
      },
    );
  });

  it("skips schema column groups with missing element nodes", () => {
    withMockSchemaColumnDescriptor(
      [
        {
          id: "lineations",
          label: "Lineations",
          path: ["lineation_data"],
          columns: ["trend", "plunge"],
        },
      ],
      {
        locations: {
          coordinates: { width: 3, data_type: "float64", length: 2, data: "coord-hash" },
          // lineation_data is absent
          attributes: [],
        },
      },
      (supported) => {
        expect(supported.attachments[0]!.schemaColumns).toEqual([]);
      },
    );
  });
});

describe("loadAttachment — schema column groups", () => {
  async function buildSchemaColumnFixture() {
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2, 3]),
      col1: Float64Array.from([4, 5, 6]),
      col2: Float64Array.from([7, 8, 9]),
    });

    const lineationBlob = await makeBlob({
      col0: Float64Array.from([10, 20, 30]),
      col1: Float64Array.from([40, 50, 60]),
    });

    const orientationBlob = await makeBlob({
      col0: Float64Array.from([100, 200, 300]),
      col1: Float64Array.from([110, 210, 310]),
    });

    const gradeBlob = await makeBlob({
      col0: Float64Array.from([0.1, 0.2, 0.3]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, lineationBlob.ref, lineationBlob.bytes);
    await store.put(scope, orientationBlob.ref, orientationBlob.bytes);
    await store.put(scope, gradeBlob.ref, gradeBlob.bytes);

    const descriptor: SchemaDescriptor = {
      family: "test-schema-cols",
      matches: () => true,
      attachments: [
        {
          id: "locations",
          jsonPath: ["locations"],
          identityFrom: { path: ["coordinates"], columns: ["x", "y", "z"] },
          schemaColumns: [
            {
              id: "lineations",
              label: "Lineations",
              path: ["lineation_data"],
              columns: ["trend", "plunge"],
            },
            {
              id: "plane_orientations",
              label: "Plane Orientations",
              path: ["orientation_data"],
              columns: ["dip_azimuth", "dip"],
            },
          ],
        },
      ],
    };

    const spy = vi.spyOn(registry, "lookupDescriptor").mockReturnValue(descriptor);

    const envelope = makeEnvelope(
      "/objects/test/1.0.0/test.schema.json",
      {
        locations: {
          coordinates: { width: 3, data_type: "float64", length: 3, data: coordBlob.ref },
          lineation_data: { width: 2, data_type: "float64", length: 3, data: lineationBlob.ref },
          orientation_data: { width: 2, data_type: "float64", length: 3, data: orientationBlob.ref },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: { data_type: "float64", length: 3, data: gradeBlob.ref },
              nan_description: { values: [] },
            },
          ],
        },
      },
      [coordBlob, lineationBlob, orientationBlob, gradeBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    return { store, envelope, attachment, spy };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads all schema column groups with { kind: 'all' }", async () => {
    const { store, envelope, attachment } = await buildSchemaColumnFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "none" },
      schemaColumns: { kind: "all" },
    });

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z", "trend", "plunge", "dip_azimuth", "dip"]);
    expect(result.table.numRows).toBe(3);
    expect(result.errors).toEqual([]);
    expect(result.schemaColumnErrors).toEqual([]);

    // Verify values
    expect(result.table.getChildAt(3)?.toArray()).toEqual(Float64Array.from([10, 20, 30]));
    expect(result.table.getChildAt(4)?.toArray()).toEqual(Float64Array.from([40, 50, 60]));
  });

  it("loads selected schema column groups with { kind: 'ids' }", async () => {
    const { store, envelope, attachment } = await buildSchemaColumnFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "none" },
      schemaColumns: { kind: "ids", ids: ["lineations"] },
    });

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z", "trend", "plunge"]);
    expect(result.table.numRows).toBe(3);
    expect(result.schemaColumnErrors).toEqual([]);
  });

  it("excludes schema columns with { kind: 'none' }", async () => {
    const { store, envelope, attachment } = await buildSchemaColumnFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "none" },
      schemaColumns: { kind: "none" },
    });

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z"]);
  });

  it("excludes schema columns when schemaColumns option is omitted", async () => {
    const { store, envelope, attachment } = await buildSchemaColumnFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "none" },
    });

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z"]);
  });

  it("places schema columns between identity and attribute columns", async () => {
    const { store, envelope, attachment } = await buildSchemaColumnFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
      schemaColumns: { kind: "ids", ids: ["lineations"] },
    });

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z", "trend", "plunge", "Grade"]);
  });

  it("sets role 'schema-column' and correct groupId in column metadata", async () => {
    const { store, envelope, attachment } = await buildSchemaColumnFixture();
    const deps: LoadDeps = { store, scope };

    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "none" },
      schemaColumns: { kind: "ids", ids: ["lineations"] },
    });

    const trendField = result.table.schema.fields.find((f) => f.name === "trend")!;
    expect(getColumnRole(trendField)).toBe("schema-column");
    expect(getSchemaColumnGroupId(trendField)).toBe("lineations");

    const plungeField = result.table.schema.fields.find((f) => f.name === "plunge")!;
    expect(getColumnRole(plungeField)).toBe("schema-column");
    expect(getSchemaColumnGroupId(plungeField)).toBe("lineations");
  });

  it("isolates schema column group validation errors", async () => {
    // Create a blob with wrong width (1 column instead of 2)
    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2, 3]),
      col1: Float64Array.from([4, 5, 6]),
      col2: Float64Array.from([7, 8, 9]),
    });

    const badLineationBlob = await makeBlob({
      col0: Float64Array.from([10, 20, 30]),
    });

    const orientationBlob = await makeBlob({
      col0: Float64Array.from([100, 200, 300]),
      col1: Float64Array.from([110, 210, 310]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, badLineationBlob.ref, badLineationBlob.bytes);
    await store.put(scope, orientationBlob.ref, orientationBlob.bytes);

    const descriptor: SchemaDescriptor = {
      family: "test-schema-cols",
      matches: () => true,
      attachments: [
        {
          id: "locations",
          jsonPath: ["locations"],
          identityFrom: { path: ["coordinates"], columns: ["x", "y", "z"] },
          schemaColumns: [
            {
              id: "lineations",
              label: "Lineations",
              path: ["lineation_data"],
              columns: ["trend", "plunge"],
            },
            {
              id: "plane_orientations",
              label: "Plane Orientations",
              path: ["orientation_data"],
              columns: ["dip_azimuth", "dip"],
            },
          ],
        },
      ],
    };

    const spy = vi.spyOn(registry, "lookupDescriptor").mockReturnValue(descriptor);

    const envelope = makeEnvelope(
      "/objects/test/1.0.0/test.schema.json",
      {
        locations: {
          coordinates: { width: 3, data_type: "float64", length: 3, data: coordBlob.ref },
          lineation_data: { width: 2, data_type: "float64", length: 3, data: badLineationBlob.ref },
          orientation_data: { width: 2, data_type: "float64", length: 3, data: orientationBlob.ref },
          attributes: [],
        },
      },
      [coordBlob, badLineationBlob, orientationBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const att = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(att, envelope, deps, {
      attributes: { kind: "none" },
      schemaColumns: { kind: "all" },
    });

    // Identity should still be present
    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toContain("x");
    expect(colNames).toContain("y");
    expect(colNames).toContain("z");

    // Good group should be present
    expect(colNames).toContain("dip_azimuth");
    expect(colNames).toContain("dip");

    // Bad group should produce an error, not break the load
    expect(result.schemaColumnErrors).toHaveLength(1);
    expect(result.schemaColumnErrors[0]!.groupId).toBe("lineations");
    expect(result.schemaColumnErrors[0]!.groupLabel).toBe("Lineations");
    expect(result.schemaColumnErrors[0]!.message).toMatch(/Data integrity error/);

    // Attribute errors should be unaffected
    expect(result.errors).toEqual([]);

    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// CDF descriptor
// ---------------------------------------------------------------------------

describe("CDF descriptor", () => {
  it("lookupDescriptor matches the CDF schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/non-parametric-continuous-cumulative-distribution/1.2.0/non-parametric-continuous-cumulative-distribution.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe(
      "non-parametric-continuous-cumulative-distribution",
    );
  });

  it("describeObject returns 1 attachment with identity columns and propertiesData", () => {
    const cdfEnvelope = makeEnvelope(
      "/objects/non-parametric-continuous-cumulative-distribution/1.2.0/non-parametric-continuous-cumulative-distribution.schema.json",
      {
        cdf: {
          values: {
            data: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            length: 100,
            width: 2,
            data_type: "float64",
          },
          lower_tail_extrapolation: "no_extrapolation",
          upper_tail_extrapolation: "no_extrapolation",
        },
        is_declustered: false,
        support: "point",
      },
      [
        {
          name: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          downloadUrl: "https://example.com/blob",
        },
      ],
    );

    const desc = describeObject(cdfEnvelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    // One attachment: "cdf"
    expect(supported.attachments).toHaveLength(1);
    expect(supported.attachments[0]!.id).toBe("cdf");
    expect(supported.attachments[0]!.identity).not.toBeNull();
    expect(supported.attachments[0]!.identity!.columns).toEqual([
      "values",
      "probabilities",
    ]);

    // propertiesData should contain the entire body
    expect(supported.propertiesData).toBeDefined();
    expect(supported.propertiesData).toHaveProperty("is_declustered", false);
    expect(supported.propertiesData).toHaveProperty("support", "point");
    expect(supported.propertiesData).toHaveProperty("cdf");
  });
});

// ---------------------------------------------------------------------------
// Lineations Data Pointset descriptor
// ---------------------------------------------------------------------------

describe("Lineations Data Pointset descriptor", () => {
  it("lookupDescriptor matches the lineations-data-pointset schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/lineations-data-pointset/1.3.0/lineations-data-pointset.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("lineations-data-pointset");
  });

  it("describeObject returns 1 attachment with identity and lineations schema columns", () => {
    const envelope = makeEnvelope(
      "/objects/lineations-data-pointset/1.3.0/lineations-data-pointset.schema.json",
      {
        locations: {
          coordinates: {
            data: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            length: 10,
            width: 3,
            data_type: "float64",
          },
          lineations: {
            data: "1bcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            length: 10,
            width: 2,
            data_type: "float64",
          },
          attributes: [],
        },
      },
      [
        {
          name: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          downloadUrl: "https://example.com/coords",
        },
        {
          name: "1bcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          downloadUrl: "https://example.com/lineations",
        },
      ],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.attachments).toHaveLength(1);
    const att = supported.attachments[0]!;
    expect(att.id).toBe("locations");
    expect(att.identity).not.toBeNull();
    expect(att.identity!.columns).toEqual(["x", "y", "z"]);

    expect(att.schemaColumns).toHaveLength(1);
    expect(att.schemaColumns[0]!.id).toBe("lineations");
    expect(att.schemaColumns[0]!.label).toBe("Lineations");
    expect(att.schemaColumns[0]!.columns).toEqual(["trend", "plunge"]);
  });
});

// ---------------------------------------------------------------------------
// Planar Data Pointset descriptor
// ---------------------------------------------------------------------------

describe("Planar Data Pointset descriptor", () => {
  it("lookupDescriptor matches the planar-data-pointset schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/planar-data-pointset/1.3.0/planar-data-pointset.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("planar-data-pointset");
  });

  it("describeObject returns 1 attachment with identity and 2 schema column groups", () => {
    const envelope = makeEnvelope(
      "/objects/planar-data-pointset/1.3.0/planar-data-pointset.schema.json",
      {
        locations: {
          coordinates: {
            data: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            length: 10,
            width: 3,
            data_type: "float64",
          },
          plane_orientations: {
            data: "2bcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            length: 10,
            width: 2,
            data_type: "float64",
          },
          plane_polarity: {
            data: "3bcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            length: 10,
            width: 1,
            data_type: "bool",
          },
          attributes: [],
        },
      },
      [
        {
          name: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          downloadUrl: "https://example.com/coords",
        },
        {
          name: "2bcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          downloadUrl: "https://example.com/orientations",
        },
        {
          name: "3bcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          downloadUrl: "https://example.com/polarity",
        },
      ],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.attachments).toHaveLength(1);
    const att = supported.attachments[0]!;
    expect(att.id).toBe("locations");
    expect(att.identity).not.toBeNull();
    expect(att.identity!.columns).toEqual(["x", "y", "z"]);

    expect(att.schemaColumns).toHaveLength(2);
    expect(att.schemaColumns[0]!.id).toBe("plane_orientations");
    expect(att.schemaColumns[0]!.label).toBe("Plane Orientations");
    expect(att.schemaColumns[0]!.columns).toEqual(["dip_azimuth", "dip"]);
    expect(att.schemaColumns[1]!.id).toBe("plane_polarity");
    expect(att.schemaColumns[1]!.label).toBe("Plane Polarity");
    expect(att.schemaColumns[1]!.columns).toEqual(["polarity"]);
  });
});

// ---------------------------------------------------------------------------
// Local Ellipsoids descriptor
// ---------------------------------------------------------------------------

describe("Local Ellipsoids descriptor", () => {
  it("lookupDescriptor matches the local-ellipsoids schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/local-ellipsoids/1.3.0/local-ellipsoids.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("local-ellipsoids");
  });

  it("describeObject returns 2 attachments — locations and ellipsoids", () => {
    const envelope = makeEnvelope(
      "/objects/local-ellipsoids/1.3.0/local-ellipsoids.schema.json",
      {
        locations: {
          coordinates: {
            data: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            length: 10,
            width: 3,
            data_type: "float64",
          },
        },
        ellipsoids: {
          values: {
            data: "4bcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            length: 10,
            width: 6,
            data_type: "float64",
          },
          attributes: [],
        },
      },
      [
        {
          name: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          downloadUrl: "https://example.com/coords",
        },
        {
          name: "4bcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          downloadUrl: "https://example.com/values",
        },
      ],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.attachments).toHaveLength(2);

    const locAtt = supported.attachments[0]!;
    expect(locAtt.id).toBe("locations");
    expect(locAtt.identity).not.toBeNull();
    expect(locAtt.identity!.columns).toEqual(["x", "y", "z"]);

    const ellAtt = supported.attachments[1]!;
    expect(ellAtt.id).toBe("ellipsoids");
    expect(ellAtt.identity).not.toBeNull();
    expect(ellAtt.identity!.columns).toEqual([
      "dip_azimuth",
      "dip",
      "pitch",
      "major",
      "semi_major",
      "minor",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Variogram descriptor
// ---------------------------------------------------------------------------

describe("Variogram descriptor", () => {
  it("lookupDescriptor matches the variogram schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/variogram/1.2.0/variogram.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("variogram");
  });

  it("describeObject returns 0 attachments and propertiesData for the entire body", () => {
    const variogramEnvelope = makeEnvelope(
      "/objects/variogram/1.2.0/variogram.schema.json",
      {
        name: "Test Variogram",
        nugget: 0.1,
        sill: 1.0,
        nested_structures: [
          { type: "spherical", range: 100, contribution: 0.9 },
        ],
      },
      [],
    );

    const desc = describeObject(variogramEnvelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.schemaFamily).toBe("variogram");
    expect(supported.attachments).toHaveLength(0);
    expect(supported.propertiesData).toBeDefined();
    expect(supported.propertiesData).toHaveProperty("nugget", 0.1);
    expect(supported.propertiesData).toHaveProperty("sill", 1.0);
    expect(supported.propertiesData).toHaveProperty("nested_structures");
  });
});

// ---------------------------------------------------------------------------
// Global Ellipsoid descriptor
// ---------------------------------------------------------------------------

describe("Global Ellipsoid descriptor", () => {
  it("lookupDescriptor matches the global-ellipsoid schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/global-ellipsoid/1.2.0/global-ellipsoid.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("global-ellipsoid");
  });

  it("describeObject returns 0 attachments and propertiesData for the entire body", () => {
    const ellipsoidEnvelope = makeEnvelope(
      "/objects/global-ellipsoid/1.2.0/global-ellipsoid.schema.json",
      {
        orientation: { azimuth: 45, dip: 30, pitch: 0 },
        ranges: { major: 500, semi_major: 300, minor: 100 },
      },
      [],
    );

    const desc = describeObject(ellipsoidEnvelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.schemaFamily).toBe("global-ellipsoid");
    expect(supported.attachments).toHaveLength(0);
    expect(supported.propertiesData).toBeDefined();
    expect(supported.propertiesData).toHaveProperty("orientation");
    expect(supported.propertiesData).toHaveProperty("ranges");
  });
});

// ---------------------------------------------------------------------------
// Line Segments descriptor
// ---------------------------------------------------------------------------

describe("Line Segments descriptor", () => {
  it("lookupDescriptor matches line-segments 1.0.1", () => {
    const desc = registry.lookupDescriptor(
      "/objects/line-segments/1.1.0/line-segments.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("line-segments");
  });

  it("lookupDescriptor matches line-segments 1.2.0", () => {
    const desc = registry.lookupDescriptor(
      "/objects/line-segments/1.1.0/line-segments.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("line-segments");
  });

  it("describeObject produces 2 attachments for line-segments", () => {
    const envelope = makeEnvelope(
      "/objects/line-segments/1.1.0/line-segments.schema.json",
      {
        segments: {
          vertices: {
            data: "a".repeat(64),
            length: 10,
            width: 3,
            data_type: "float64",
            attributes: [],
          },
          indices: {
            data: "b".repeat(64),
            length: 5,
            width: 2,
            data_type: "uint64",
            attributes: [],
          },
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("line-segments");
    expect(supported.attachments).toHaveLength(2);

    const vertices = supported.attachments[0]!;
    expect(vertices.id).toBe("segments.vertices");
    expect(vertices.rowCount).toBe(10);
    expect(vertices.identity).not.toBeNull();
    expect(vertices.identity!.columns).toEqual(["x", "y", "z"]);

    const indices = supported.attachments[1]!;
    expect(indices.id).toBe("segments.indices");
    expect(indices.rowCount).toBe(5);
    expect(indices.identity).not.toBeNull();
    expect(indices.identity!.columns).toEqual(["n0", "n1"]);
  });
});

// ---------------------------------------------------------------------------
// Triangle Mesh descriptor
// ---------------------------------------------------------------------------

describe("Triangle Mesh descriptor", () => {
  it("lookupDescriptor matches triangle-mesh 1.0.1", () => {
    const desc = registry.lookupDescriptor(
      "/objects/triangle-mesh/1.1.0/triangle-mesh.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("triangle-mesh");
  });

  it("describeObject produces 2 attachments for triangle-mesh", () => {
    const envelope = makeEnvelope(
      "/objects/triangle-mesh/1.1.0/triangle-mesh.schema.json",
      {
        triangles: {
          vertices: {
            data: "c".repeat(64),
            length: 12,
            width: 3,
            data_type: "float64",
            attributes: [],
          },
          indices: {
            data: "d".repeat(64),
            length: 8,
            width: 3,
            data_type: "uint64",
            attributes: [],
          },
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("triangle-mesh");
    expect(supported.attachments).toHaveLength(2);

    const vertices = supported.attachments[0]!;
    expect(vertices.id).toBe("triangles.vertices");
    expect(vertices.rowCount).toBe(12);
    expect(vertices.identity).not.toBeNull();
    expect(vertices.identity!.columns).toEqual(["x", "y", "z"]);

    const indices = supported.attachments[1]!;
    expect(indices.id).toBe("triangles.indices");
    expect(indices.rowCount).toBe(8);
    expect(indices.identity).not.toBeNull();
    expect(indices.identity!.columns).toEqual(["n0", "n1", "n2"]);
  });
});

// ---------------------------------------------------------------------------
// Triangle Mesh v2 descriptor
// ---------------------------------------------------------------------------

describe("Triangle Mesh v2 descriptor", () => {
  const V2_SCHEMA = "/objects/triangle-mesh/2.2.0/triangle-mesh.schema.json";

  function makeTrianglesObject() {
    return {
      triangles: {
        vertices: {
          data: "a".repeat(64),
          length: 4,
          width: 3,
          data_type: "float64",
          attributes: [],
        },
        indices: {
          data: "b".repeat(64),
          length: 2,
          width: 3,
          data_type: "int32",
          attributes: [],
        },
      },
    };
  }

  it("routes v2 schema to v2 descriptor (family = triangle-mesh), v1 still routes to v1", () => {
    const v2 = registry.lookupDescriptor(V2_SCHEMA);
    expect(v2).toBeDefined();
    expect(v2!.family).toBe("triangle-mesh");
    expect(v2!.matches("/objects/triangle-mesh/2.2.0/triangle-mesh.schema.json")).toBe(true);
    expect(v2!.matches("/objects/triangle-mesh/1.1.0/triangle-mesh.schema.json")).toBe(false);

    const v1 = registry.lookupDescriptor(
      "/objects/triangle-mesh/1.1.0/triangle-mesh.schema.json",
    );
    expect(v1).toBeDefined();
    expect(v1!.family).toBe("triangle-mesh");
    expect(v1!.matches("/objects/triangle-mesh/1.1.0/triangle-mesh.schema.json")).toBe(true);
    expect(v1!.matches(V2_SCHEMA)).toBe(false);
  });

  it("full envelope (all optional present) — 5 attachments", () => {
    const obj = {
      ...makeTrianglesObject(),
      parts: {
        chunks: {
          data: "c".repeat(64),
          length: 3,
          width: 2,
          data_type: "int32",
        },
        triangle_indices: {
          data: "d".repeat(64),
          length: 5,
          width: 1,
          data_type: "int32",
        },
        attributes: [],
      },
      edges: {
        indices: {
          data: "e".repeat(64),
          length: 6,
          width: 2,
          data_type: "int32",
        },
        attributes: [],
        parts: {
          chunks: {
            data: "f".repeat(64),
            length: 2,
            width: 2,
            data_type: "int32",
          },
          attributes: [],
        },
      },
    };

    const envelope = makeEnvelope(V2_SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("triangle-mesh");
    expect(supported.attachments).toHaveLength(5);

    expect(supported.attachments[0]!.id).toBe("triangles.vertices");
    expect(supported.attachments[1]!.id).toBe("triangles.indices");
    expect(supported.attachments[2]!.id).toBe("parts");
    expect(supported.attachments[3]!.id).toBe("edges");
    expect(supported.attachments[4]!.id).toBe("edges.parts");
  });

  it("minimal envelope (only required) — 2 attachments", () => {
    const obj = makeTrianglesObject();
    const envelope = makeEnvelope(V2_SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.attachments).toHaveLength(2);

    expect(supported.attachments[0]!.id).toBe("triangles.vertices");
    expect(supported.attachments[1]!.id).toBe("triangles.indices");
  });

  it("partial — parts present, edges absent — 3 attachments", () => {
    const obj = {
      ...makeTrianglesObject(),
      parts: {
        chunks: {
          data: "c".repeat(64),
          length: 3,
          width: 2,
          data_type: "int32",
        },
        attributes: [],
      },
    };

    const envelope = makeEnvelope(V2_SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.attachments).toHaveLength(3);

    expect(supported.attachments[0]!.id).toBe("triangles.vertices");
    expect(supported.attachments[1]!.id).toBe("triangles.indices");
    expect(supported.attachments[2]!.id).toBe("parts");
  });

  it("partial — edges present (with nested parts), parts absent — 4 attachments", () => {
    const obj = {
      ...makeTrianglesObject(),
      edges: {
        indices: {
          data: "e".repeat(64),
          length: 6,
          width: 2,
          data_type: "int32",
        },
        attributes: [],
        parts: {
          chunks: {
            data: "f".repeat(64),
            length: 2,
            width: 2,
            data_type: "int32",
          },
          attributes: [],
        },
      },
    };

    const envelope = makeEnvelope(V2_SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.attachments).toHaveLength(4);

    expect(supported.attachments[0]!.id).toBe("triangles.vertices");
    expect(supported.attachments[1]!.id).toBe("triangles.indices");
    expect(supported.attachments[2]!.id).toBe("edges");
    expect(supported.attachments[3]!.id).toBe("edges.parts");
  });

  it("load round-trip for parts with chunks identity and triangle_indices schema column", async () => {
    const chunksBlob = await makeBlob({
      col0: Int32Array.from([0, 10]),
      col1: Int32Array.from([5, 8]),
    });

    const triIdxBlob = await makeBlob({
      col0: Int32Array.from([0, 1]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, chunksBlob.ref, chunksBlob.bytes);
    await store.put(scope, triIdxBlob.ref, triIdxBlob.bytes);

    const obj = {
      ...makeTrianglesObject(),
      parts: {
        chunks: {
          data: chunksBlob.ref,
          length: 2,
          width: 2,
          data_type: "int32",
        },
        triangle_indices: {
          data: triIdxBlob.ref,
          length: 2,
          width: 1,
          data_type: "int32",
        },
        attributes: [],
      },
    };

    const envelope = makeEnvelope(
      V2_SCHEMA,
      obj,
      [chunksBlob, triIdxBlob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const partsAtt = supported.attachments.find((a) => a.id === "parts")!;
    expect(partsAtt).toBeDefined();
    expect(partsAtt.identity!.columns).toEqual(["offset", "count"]);
    expect(partsAtt.schemaColumns).toHaveLength(1);
    expect(partsAtt.schemaColumns[0]!.id).toBe("triangle_indices");

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(partsAtt, envelope, deps, {
      attributes: { kind: "none" },
      schemaColumns: { kind: "all" },
    });

    expect(result.errors).toEqual([]);
    expect(result.schemaColumnErrors).toEqual([]);
    expect(result.table.numRows).toBe(2);

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["offset", "count", "index"]);

    expect(result.table.getChildAt(0)?.toArray()).toEqual(Int32Array.from([0, 10]));
    expect(result.table.getChildAt(1)?.toArray()).toEqual(Int32Array.from([5, 8]));
    expect(result.table.getChildAt(2)?.toArray()).toEqual(Int32Array.from([0, 1]));
  });
});

// ---------------------------------------------------------------------------
// Geological Sections descriptor
// ---------------------------------------------------------------------------

describe("Geological Sections descriptor", () => {
  it("lookupDescriptor matches the geological-sections schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/geological-sections/1.2.0/geological-sections.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("geological-sections");
  });

  it("describeObject returns 0 attachments and propertiesData for the entire body", () => {
    const envelope = makeEnvelope(
      "/objects/geological-sections/1.2.0/geological-sections.schema.json",
      {
        folders: [],
        sections: [],
        volumes: [],
        surfaces: [],
        materials: [],
        layer_order: [],
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.schemaFamily).toBe("geological-sections");
    expect(supported.attachments).toHaveLength(0);
    expect(supported.propertiesData).toBeDefined();
    expect(supported.propertiesData).toHaveProperty("folders");
    expect(supported.propertiesData).toHaveProperty("sections");
    expect(supported.propertiesData).toHaveProperty("volumes");
    expect(supported.propertiesData).toHaveProperty("surfaces");
    expect(supported.propertiesData).toHaveProperty("materials");
  });
});

// ---------------------------------------------------------------------------
// Geological Model Meshes descriptor
// ---------------------------------------------------------------------------

describe("Geological Model Meshes descriptor", () => {
  it("lookupDescriptor matches the geological-model-meshes schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/geological-model-meshes/1.1.0/geological-model-meshes.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("geological-model-meshes");
  });

  it("describeObject returns 0 attachments and propertiesData for the entire body", () => {
    const envelope = makeEnvelope(
      "/objects/geological-model-meshes/1.1.0/geological-model-meshes.schema.json",
      {
        folders: [],
        volumes: [],
        surfaces: [],
        materials: [],
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.schemaFamily).toBe("geological-model-meshes");
    expect(supported.attachments).toHaveLength(0);
    expect(supported.propertiesData).toBeDefined();
    expect(supported.propertiesData).toHaveProperty("folders");
    expect(supported.propertiesData).toHaveProperty("volumes");
    expect(supported.propertiesData).toHaveProperty("surfaces");
    expect(supported.propertiesData).toHaveProperty("materials");
  });
});

// ---------------------------------------------------------------------------
// Geological Model Meshes v2 descriptor
// ---------------------------------------------------------------------------

function makeGmmV2Body(opts?: {
  includeVolumeAttributes?: boolean;
  includeSurfaceAttributes?: boolean;
}) {
  const includeVol = opts?.includeVolumeAttributes ?? false;
  const includeSurf = opts?.includeSurfaceAttributes ?? false;

  const body: Record<string, unknown> = {
    triangle_geometry: {
      triangles: {
        vertices: {
          data: "a".repeat(64),
          length: 10,
          width: 3,
          data_type: "float64",
          attributes: [],
        },
        indices: {
          data: "b".repeat(64),
          length: 6,
          width: 3,
          data_type: "int32",
          attributes: [],
        },
      },
      parts: {
        chunks: {
          data: "c".repeat(64),
          length: 2,
          width: 2,
          data_type: "int32",
        },
        triangle_indices: {
          data: "f".repeat(64),
          length: 6,
          width: 1,
          data_type: "int32",
        },
        attributes: [],
      },
    },
    volumes: [
      {
        name: "Upper",
        parts: [{ index: 0, reversed: false }],
        feature: "OutputVolume",
      },
    ],
    surfaces: [
      {
        name: "Contact",
        parts: [{ index: 1, reversed: false }],
        feature: "OutputSurface",
      },
    ],
    materials: [],
    folders: [{ name: "Root", items: [{ volume_index: 0 }] }],
  };

  if (includeVol) {
    body.volume_attributes = {
      attributes: [
        {
          key: "density",
          name: "Density",
          attribute_type: "scalar",
          values: {
            data_type: "float64",
            length: 1,
            data: "d".repeat(64),
          },
          nan_description: { values: [] },
        },
      ],
    };
  }

  if (includeSurf) {
    body.surface_attributes = {
      attributes: [
        {
          key: "roughness",
          name: "Roughness",
          attribute_type: "scalar",
          values: {
            data_type: "float64",
            length: 1,
            data: "e".repeat(64),
          },
          nan_description: { values: [] },
        },
      ],
    };
  }

  return body;
}

const GMM_V2_SCHEMA =
  "/objects/geological-model-meshes/2.2.0/geological-model-meshes.schema.json";

describe("Geological Model Meshes v2 descriptor", () => {
  it("v2 schema ID routes to v2 descriptor (family = geological-model-meshes)", () => {
    const desc = registry.lookupDescriptor(GMM_V2_SCHEMA);
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("geological-model-meshes");
    expect(desc!.matches(GMM_V2_SCHEMA)).toBe(true);
  });

  it("v1 schema ID still routes to v1 descriptor", () => {
    const v1Schema =
      "/objects/geological-model-meshes/1.1.0/geological-model-meshes.schema.json";
    const desc = registry.lookupDescriptor(v1Schema);
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("geological-model-meshes");
    // v1 has no attachments (properties-view only)
    expect(desc!.attachments).toHaveLength(0);
  });

  it("full envelope produces 5 attachments with correct IDs", () => {
    const body = makeGmmV2Body({
      includeVolumeAttributes: true,
      includeSurfaceAttributes: true,
    });
    const envelope = makeEnvelope(GMM_V2_SCHEMA, body, []);

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("geological-model-meshes");
    expect(supported.attachments).toHaveLength(5);

    const ids = supported.attachments.map((a) => a.id);
    expect(ids).toEqual([
      "triangle_geometry.vertices",
      "triangle_geometry.indices",
      "triangle_geometry.parts",
      "volume_attributes",
      "surface_attributes",
    ]);

    // Verify identity columns
    const vertices = supported.attachments[0]!;
    expect(vertices.rowCount).toBe(10);
    expect(vertices.identity!.columns).toEqual(["x", "y", "z"]);

    const indices = supported.attachments[1]!;
    expect(indices.rowCount).toBe(6);
    expect(indices.identity!.columns).toEqual(["n0", "n1", "n2"]);

    const parts = supported.attachments[2]!;
    expect(parts.rowCount).toBe(2);
    expect(parts.identity!.columns).toEqual(["offset", "count"]);
    expect(parts.schemaColumns).toHaveLength(1);
    expect(parts.schemaColumns[0]!.id).toBe("triangle_indices");
  });

  it("minimal envelope (no optional attributes) produces 3 attachments", () => {
    const body = makeGmmV2Body();
    const envelope = makeEnvelope(GMM_V2_SCHEMA, body, []);

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.attachments).toHaveLength(3);

    const ids = supported.attachments.map((a) => a.id);
    expect(ids).toEqual([
      "triangle_geometry.vertices",
      "triangle_geometry.indices",
      "triangle_geometry.parts",
    ]);
  });

  it("propertiesData is present on the description", () => {
    const body = makeGmmV2Body();
    const envelope = makeEnvelope(GMM_V2_SCHEMA, body, []);

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.propertiesData).toBeDefined();
    expect(supported.propertiesData).toHaveProperty("triangle_geometry");
    expect(supported.propertiesData).toHaveProperty("volumes");
    expect(supported.propertiesData).toHaveProperty("surfaces");
    expect(supported.propertiesData).toHaveProperty("folders");
  });

  it("load round-trip for triangle_geometry.parts", async () => {
    const chunksBlob = await makeBlob({
      col0: Int32Array.from([0, 3]),
      col1: Int32Array.from([3, 5]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, chunksBlob.ref, chunksBlob.bytes);

    const body = makeGmmV2Body();
    // Replace the chunks data hash with the real blob ref
    (
      (body.triangle_geometry as Record<string, unknown>)
        .parts as Record<string, unknown>
    ).chunks = {
      data: chunksBlob.ref,
      length: 2,
      width: 2,
      data_type: "int32",
    };

    const envelope = makeEnvelope(
      GMM_V2_SCHEMA,
      body,
      [{ name: chunksBlob.ref, downloadUrl: `https://test.blob.core.windows.net/${chunksBlob.ref}` }],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const partsAtt = supported.attachments.find(
      (a) => a.id === "triangle_geometry.parts",
    )!;
    expect(partsAtt).toBeDefined();

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(partsAtt, envelope, deps, {
      attributes: { kind: "none" },
    });

    expect(result.errors).toEqual([]);
    expect(result.table.numRows).toBe(2);

    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["offset", "count"]);

    expect(result.table.getChildAt(0)?.toArray()).toEqual(
      Int32Array.from([0, 3]),
    );
    expect(result.table.getChildAt(1)?.toArray()).toEqual(
      Int32Array.from([3, 5]),
    );
  });
});

// ---------------------------------------------------------------------------
// Design Geometry descriptor
// ---------------------------------------------------------------------------

describe("Design Geometry descriptor", () => {
  it("lookupDescriptor matches the design-geometry schema ID", () => {
    const desc = registry.lookupDescriptor(
      "/objects/design-geometry/1.1.0/design-geometry.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("design-geometry");
  });

  it("describeObject returns 0 attachments and propertiesData for the entire body", () => {
    const envelope = makeEnvelope(
      "/objects/design-geometry/1.1.0/design-geometry.schema.json",
      {
        parts: [],
        brep_data: { format: "step", data: "blob-hash" },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.schemaFamily).toBe("design-geometry");
    expect(supported.attachments).toHaveLength(0);
    expect(supported.propertiesData).toBeDefined();
    expect(supported.propertiesData).toHaveProperty("parts");
    expect(supported.propertiesData).toHaveProperty("brep_data");
  });
});

// ---------------------------------------------------------------------------
// Line Segments v2 descriptor
// ---------------------------------------------------------------------------

describe("Line Segments v2 descriptor", () => {
  it("v2 schema ID routes to v2 descriptor (family = line-segments)", () => {
    const desc = registry.lookupDescriptor(
      "/objects/line-segments/2.2.0/line-segments.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("line-segments");
    expect(desc!.attachments).toHaveLength(3);
  });

  it("v1 schema ID still routes to v1 descriptor", () => {
    const desc = registry.lookupDescriptor(
      "/objects/line-segments/1.1.0/line-segments.schema.json",
    );
    expect(desc).toBeDefined();
    expect(desc!.family).toBe("line-segments");
    expect(desc!.attachments).toHaveLength(2);
  });

  it("describeObject produces 3 attachments when parts are present", () => {
    const envelope = makeEnvelope(
      "/objects/line-segments/2.2.0/line-segments.schema.json",
      {
        segments: {
          vertices: {
            data: "a".repeat(64),
            length: 10,
            width: 3,
            data_type: "float64",
            attributes: [],
          },
          indices: {
            data: "b".repeat(64),
            length: 5,
            width: 2,
            data_type: "int32",
            attributes: [],
          },
        },
        parts: {
          chunks: {
            data: "c".repeat(64),
            length: 3,
            width: 2,
            data_type: "int32",
          },
          attributes: [],
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("line-segments");
    expect(supported.attachments).toHaveLength(3);

    const vertices = supported.attachments[0]!;
    expect(vertices.id).toBe("segments.vertices");
    expect(vertices.rowCount).toBe(10);
    expect(vertices.identity!.columns).toEqual(["x", "y", "z"]);

    const indices = supported.attachments[1]!;
    expect(indices.id).toBe("segments.indices");
    expect(indices.rowCount).toBe(5);
    expect(indices.identity!.columns).toEqual(["n0", "n1"]);

    const parts = supported.attachments[2]!;
    expect(parts.id).toBe("parts");
    expect(parts.rowCount).toBe(3);
    expect(parts.identity!.columns).toEqual(["offset", "count"]);
  });

  it("describeObject produces 2 attachments when parts are absent", () => {
    const envelope = makeEnvelope(
      "/objects/line-segments/2.2.0/line-segments.schema.json",
      {
        segments: {
          vertices: {
            data: "a".repeat(64),
            length: 10,
            width: 3,
            data_type: "float64",
            attributes: [],
          },
          indices: {
            data: "b".repeat(64),
            length: 5,
            width: 2,
            data_type: "int32",
            attributes: [],
          },
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("line-segments");
    expect(supported.attachments).toHaveLength(2);

    expect(supported.attachments[0]!.id).toBe("segments.vertices");
    expect(supported.attachments[1]!.id).toBe("segments.indices");
  });

  it("loadAttachment round-trips the parts attachment", async () => {
    const chunksBlob = await makeBlob({
      col0: Int32Array.from([0, 10, 20]),
      col1: Int32Array.from([10, 10, 5]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, chunksBlob.ref, chunksBlob.bytes);

    const envelope = makeEnvelope(
      "/objects/line-segments/2.2.0/line-segments.schema.json",
      {
        segments: {
          vertices: {
            data: "a".repeat(64),
            length: 10,
            width: 3,
            data_type: "float64",
            attributes: [],
          },
          indices: {
            data: "b".repeat(64),
            length: 5,
            width: 2,
            data_type: "int32",
            attributes: [],
          },
        },
        parts: {
          chunks: {
            data: chunksBlob.ref,
            length: 3,
            width: 2,
            data_type: "int32",
          },
          attributes: [],
        },
      },
      [
        {
          name: chunksBlob.ref,
          downloadUrl: `https://test.blob.core.windows.net/${chunksBlob.ref}`,
        },
      ],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const partsAttachment = supported.attachments.find((a) => a.id === "parts")!;
    expect(partsAttachment).toBeDefined();

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(partsAttachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    const { table, errors } = result;
    expect(errors).toEqual([]);
    expect(table.numRows).toBe(3);

    const colNames = table.schema.fields.map((f) => f.name);
    expect(colNames).toContain("offset");
    expect(colNames).toContain("count");

    const offsetCol = table.getChild("offset");
    expect(offsetCol?.toArray()).toEqual(Int32Array.from([0, 10, 20]));

    const countCol = table.getChild("count");
    expect(countCol?.toArray()).toEqual(Int32Array.from([10, 10, 5]));
  });

  it("loads a pointset with all data: null (0-row table)", async () => {
    const store = new InMemoryBlobStore();

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            data: null,
            length: 0,
            width: 3,
            data_type: "float64",
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: { data: null, length: 0, data_type: "float64" },
              nan_description: { values: [] },
            },
          ],
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    const { table, errors } = result;
    expect(errors).toEqual([]);
    expect(table.numRows).toBe(0);

    const colNames = table.schema.fields.map((f) => f.name);
    expect(colNames).toEqual(["x", "y", "z", "Grade"]);
  });

  it("stamps evo:noData metadata on empty columns", async () => {
    const store = new InMemoryBlobStore();

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      {
        locations: {
          coordinates: {
            data: null,
            length: 0,
            width: 3,
            data_type: "float64",
          },
          attributes: [
            {
              key: "grade",
              name: "Grade",
              attribute_type: "scalar",
              values: { data: null, length: 0, data_type: "float64" },
              nan_description: { values: [] },
            },
          ],
        },
      },
      [],
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "all" },
    });

    for (const field of result.table.schema.fields) {
      expect(wasNoData(field)).toBe(true);
    }
  });
});
