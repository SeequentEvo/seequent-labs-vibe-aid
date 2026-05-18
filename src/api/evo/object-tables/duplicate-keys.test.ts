import { describe, it, expect, vi, afterEach } from "vitest";
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

import { describeObject, loadAttachment } from "./index";
import type { LoadDeps, SupportedObjectDescription } from "./index";

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
  const buf = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  buf.set(bytes);
  const hash = await sha256Hex(buf);
  return { bytes: buf, ref: asBlobRef(hash) };
}

function makeEnvelope(
  schema: string,
  object: unknown,
  dataLinks: { name: string; downloadUrl: string }[],
  objectId = "22222222-2222-4222-8222-222222222222",
): GeoscienceObjectEnvelope {
  return {
    objectId: parseObjectId(objectId),
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

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Detection — pointset with duplicate attribute keys
// ---------------------------------------------------------------------------

describe("describeObject — duplicate attribute keys", () => {
  const POINTSET = "/objects/pointset/1.3.0/pointset.schema.json";

  function pointsetWithAttrs(attrs: unknown[]) {
    return {
      locations: {
        coordinates: { width: 3, data_type: "float64", length: 3, data: "coord-h" },
        attributes: attrs,
      },
    };
  }

  it("flags individual attributes, attachment, and description when keys repeat", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const obj = pointsetWithAttrs([
      {
        key: "grade",
        name: "Grade A",
        attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "g1" },
        nan_description: { values: [] },
      },
      {
        key: "grade",
        name: "Grade B",
        attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "g2" },
        nan_description: { values: [] },
      },
      {
        key: "rock_type",
        name: "Rock Type",
        attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "r1" },
        nan_description: { values: [] },
      },
    ]);

    const desc = describeObject(makeEnvelope(POINTSET, obj, []));
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    expect(supported.hasDuplicateAttributeKeys).toBe(true);

    const att = supported.attachments[0]!;
    expect(att.duplicateAttributeKeys).toEqual(["grade"]);

    expect(att.attributes[0]!.duplicateKey).toBe(true);
    expect(att.attributes[1]!.duplicateKey).toBe(true);
    expect(att.attributes[2]!.duplicateKey).toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0]![0] as string;
    expect(msg).toContain("Schema violation");
    expect(msg).toContain('"grade"');
    expect(msg).toContain('attachment "locations"');
  });

  it("reports unflagged attributes for conformant objects (no console.warn)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const obj = pointsetWithAttrs([
      {
        key: "grade",
        name: "Grade",
        attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "g1" },
        nan_description: { values: [] },
      },
      {
        key: "rock_type",
        name: "Rock Type",
        attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "r1" },
        nan_description: { values: [] },
      },
    ]);

    const desc = describeObject(makeEnvelope(POINTSET, obj, []));
    const supported = desc as SupportedObjectDescription;

    expect(supported.hasDuplicateAttributeKeys).toBe(false);
    expect(supported.attachments[0]!.duplicateAttributeKeys).toEqual([]);
    for (const a of supported.attachments[0]!.attributes) {
      expect(a.duplicateKey).toBe(false);
    }

    expect(warn).not.toHaveBeenCalled();
  });

  it("reports multiple duplicate keys, sorted, in the same attachment", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const obj = pointsetWithAttrs([
      { key: "z_dup", name: "z1", attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "v1" }, nan_description: { values: [] } },
      { key: "a_dup", name: "a1", attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "v2" }, nan_description: { values: [] } },
      { key: "z_dup", name: "z2", attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "v3" }, nan_description: { values: [] } },
      { key: "a_dup", name: "a2", attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "v4" }, nan_description: { values: [] } },
      { key: "unique", name: "u", attribute_type: "scalar",
        values: { data_type: "float64", length: 3, data: "v5" }, nan_description: { values: [] } },
    ]);

    const desc = describeObject(makeEnvelope(POINTSET, obj, []));
    const supported = desc as SupportedObjectDescription;

    expect(supported.attachments[0]!.duplicateAttributeKeys).toEqual([
      "a_dup", "z_dup",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Loader behaviour — known limitation
// ---------------------------------------------------------------------------

describe("loadAttachment — duplicate-keyed selection (documented limitation)", () => {
  it("loads ALL attributes sharing the requested key", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const coordBlob = await makeBlob({
      col0: Float64Array.from([1, 2, 3]),
      col1: Float64Array.from([4, 5, 6]),
      col2: Float64Array.from([7, 8, 9]),
    });
    const grade1Blob = await makeBlob({
      col0: Float64Array.from([10, 20, 30]),
    });
    const grade2Blob = await makeBlob({
      col0: Float64Array.from([100, 200, 300]),
    });

    const store = new InMemoryBlobStore();
    await store.put(scope, coordBlob.ref, coordBlob.bytes);
    await store.put(scope, grade1Blob.ref, grade1Blob.bytes);
    await store.put(scope, grade2Blob.ref, grade2Blob.bytes);

    const obj = {
      locations: {
        coordinates: { width: 3, data_type: "float64", length: 3, data: coordBlob.ref },
        attributes: [
          {
            key: "grade", name: "Grade A", attribute_type: "scalar",
            values: { data_type: "float64", length: 3, data: grade1Blob.ref },
            nan_description: { values: [] },
          },
          {
            key: "grade", name: "Grade B", attribute_type: "scalar",
            values: { data_type: "float64", length: 3, data: grade2Blob.ref },
            nan_description: { values: [] },
          },
        ],
      },
    };

    const envelope = makeEnvelope(
      "/objects/pointset/1.3.0/pointset.schema.json",
      obj,
      [coordBlob, grade1Blob, grade2Blob].map((b) => ({
        name: b.ref,
        downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
      })),
    );

    const desc = describeObject(envelope);
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "keys", keys: ["grade"] },
    });

    expect(result.errors).toEqual([]);
    const colNames = result.table.schema.fields.map((f) => f.name);
    // Both Grade A and Grade B columns appear — because the loader filters by key.
    expect(colNames).toContain("Grade A");
    expect(colNames).toContain("Grade B");
  });
});
