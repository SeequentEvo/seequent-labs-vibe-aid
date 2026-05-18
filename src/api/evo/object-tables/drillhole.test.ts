import { describe, it, expect } from "vitest";
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

function makeBlobLinks(
  ...blobs: { ref: BlobRef }[]
): { name: string; downloadUrl: string }[] {
  return blobs.map((b) => ({
    name: b.ref,
    downloadUrl: `https://test.blob.core.windows.net/${b.ref}`,
  }));
}

function floatBlob(width: number, length: number, values?: number[]) {
  const data: Record<string, Float64Array> = {};
  for (let i = 0; i < width; i++) {
    data[`col${String(i)}`] = Float64Array.from(
      values?.slice(i * length, (i + 1) * length) ??
        Array.from({ length }, (_, j) => i * 100 + j),
    );
  }
  return makeBlob(data);
}

function categoryBlobs(codes: number[], lookup: [number, string][]) {
  const codesBlob = makeBlob({ col0: Int32Array.from(codes) });
  const lookupBlob = makeBlob({
    col0: Int32Array.from(lookup.map(([k]) => k)),
    col1: lookup.map(([, v]) => v),
  });
  return Promise.all([codesBlob, lookupBlob]);
}

// ---------------------------------------------------------------------------
// downhole-intervals — describeObject
// ---------------------------------------------------------------------------

describe("describeObject — downhole-intervals", () => {
  const SCHEMA = "/objects/downhole-intervals/1.3.0/downhole-intervals.schema.json";

  function makeIntervalsObject(holeIdCodes: string, holeIdTable: string) {
    return {
      start: {
        coordinates: { width: 3, data_type: "float64", length: 5, data: "start-hash" },
      },
      end: {
        coordinates: { width: 3, data_type: "float64", length: 5, data: "end-hash" },
      },
      mid_points: {
        coordinates: { width: 3, data_type: "float64", length: 5, data: "mid-hash" },
      },
      from_to: {
        intervals: {
          start_and_end: { width: 2, data_type: "float64", length: 5, data: "ft-hash" },
        },
      },
      hole_id: {
        values: { data_type: "int32", length: 5, data: holeIdCodes },
        table: { keys_data_type: "int32", values_data_type: "string", length: 3, data: holeIdTable },
      },
      attributes: [],
      is_composited: false,
    };
  }

  it("produces a single attachment with identity, schema columns, and category columns", () => {
    const obj = makeIntervalsObject("codes-hash", "lookup-hash");
    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);

    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("downhole-intervals");
    expect(supported.attachments).toHaveLength(1);

    const att = supported.attachments[0]!;
    expect(att.id).toBe("intervals");
    expect(att.rowCount).toBe(5);
    expect(att.identity).not.toBeNull();
    expect(att.identity!.columns).toEqual(["start_x", "start_y", "start_z"]);

    // Schema column groups
    expect(att.schemaColumns).toHaveLength(3);
    expect(att.schemaColumns.map((s) => s.id)).toEqual(["end", "mid_points", "from_to"]);
    expect(att.schemaColumns[2]!.columns).toEqual(["from", "to"]);

    // Category columns
    expect(att.categoryColumns).toHaveLength(1);
    expect(att.categoryColumns[0]!.id).toBe("hole_id");
    expect(att.categoryColumns[0]!.label).toBe("Hole ID");
  });

  it("matches multiple v1 versions", () => {
    for (const v of ["1.0.1", "1.1.0", "1.2.0", "1.3.0"]) {
      const schema = `/objects/downhole-intervals/${v}/downhole-intervals.schema.json`;
      const obj = makeIntervalsObject("c", "l");
      const envelope = makeEnvelope(schema, obj, []);
      expect(describeObject(envelope).kind).toBe("supported");
    }
  });

  it("rejects major version 2", () => {
    const schema = "/objects/downhole-intervals/2.0.0/downhole-intervals.schema.json";
    const obj = makeIntervalsObject("c", "l");
    const envelope = makeEnvelope(schema, obj, []);
    expect(describeObject(envelope).kind).toBe("unsupported");
  });
});

// ---------------------------------------------------------------------------
// downhole-intervals — loadAttachment with category columns
// ---------------------------------------------------------------------------

describe("loadAttachment — downhole-intervals category columns", () => {
  const SCHEMA = "/objects/downhole-intervals/1.3.0/downhole-intervals.schema.json";

  it("loads identity + category column (hole_id joined to strings)", async () => {
    const N = 3;
    const startBlob = await floatBlob(3, N);
    const [holeIdCodes, holeIdLookup] = await categoryBlobs(
      [0, 1, 0],
      [[0, "DH-001"], [1, "DH-002"]],
    );

    const store = new InMemoryBlobStore();
    await store.put(scope, startBlob.ref, startBlob.bytes);
    await store.put(scope, holeIdCodes.ref, holeIdCodes.bytes);
    await store.put(scope, holeIdLookup.ref, holeIdLookup.bytes);

    const obj = {
      start: {
        coordinates: { width: 3, data_type: "float64", length: N, data: startBlob.ref },
      },
      end: {
        coordinates: { width: 3, data_type: "float64", length: N, data: "end-h" },
      },
      mid_points: {
        coordinates: { width: 3, data_type: "float64", length: N, data: "mid-h" },
      },
      from_to: {
        intervals: {
          start_and_end: { width: 2, data_type: "float64", length: N, data: "ft-h" },
        },
      },
      hole_id: {
        values: { data_type: "int32", length: N, data: holeIdCodes.ref },
        table: {
          keys_data_type: "int32",
          values_data_type: "string",
          length: 2,
          data: holeIdLookup.ref,
        },
      },
      attributes: [],
      is_composited: false,
    };

    const envelope = makeEnvelope(
      SCHEMA,
      obj,
      makeBlobLinks(startBlob, holeIdCodes, holeIdLookup),
    );

    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    const attachment = supported.attachments[0]!;

    const deps: LoadDeps = { store, scope };
    const result = await loadAttachment(attachment, envelope, deps, {
      attributes: { kind: "none" },
      schemaColumns: { kind: "none" },
    });

    expect(result.errors).toEqual([]);
    expect(result.table.numRows).toBe(N);

    // Columns: start_x, start_y, start_z, hole_id
    const colNames = result.table.schema.fields.map((f) => f.name);
    expect(colNames).toContain("start_x");
    expect(colNames).toContain("start_y");
    expect(colNames).toContain("start_z");
    expect(colNames).toContain("hole_id");

    // Verify hole_id is a dictionary column with string values
    const holeIdCol = result.table.getChild("hole_id");
    expect(holeIdCol).not.toBeNull();
    expect(holeIdCol!.length).toBe(N);
  });
});

// ---------------------------------------------------------------------------
// downhole-collection — describeObject
// ---------------------------------------------------------------------------

describe("describeObject — downhole-collection", () => {
  const SCHEMA = "/objects/downhole-collection/1.3.1/downhole-collection.schema.json";

  function makeCollectionObject(
    collections: Record<string, unknown>[] = [],
  ) {
    return {
      location: {
        coordinates: { width: 3, data_type: "float64", length: 10, data: "coord-hash" },
        distances: { width: 3, data_type: "float64", length: 10, data: "dist-hash" },
        holes: { width: 3, data_type: "int32/uint64/uint64", length: 10, data: "holes-hash" },
        hole_id: {
          values: { data_type: "int32", length: 10, data: "codes-hash" },
          table: { keys_data_type: "int32", values_data_type: "string", length: 3, data: "lookup-hash" },
        },
        path: {
          width: 3,
          data_type: "float64",
          length: 10,
          data: "path-hash",
          attributes: [],
        },
        attributes: [],
      },
      collections,
      type: "collar",
      distance_unit: "metre",
      desurvey: "balanced_tangential",
    };
  }

  it("produces static attachments for location and path", () => {
    const obj = makeCollectionObject();
    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);

    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("downhole-collection");

    // Static: location + location.path
    const ids = supported.attachments.map((a) => a.id);
    expect(ids).toContain("location");
    expect(ids).toContain("location.path");

    const locAtt = supported.attachments.find((a) => a.id === "location")!;
    expect(locAtt.rowCount).toBe(10);
    expect(locAtt.identity!.columns).toEqual(["x", "y", "z"]);
    expect(locAtt.schemaColumns.map((s) => s.id)).toEqual(["distances", "holes"]);
    expect(locAtt.categoryColumns).toHaveLength(1);
    expect(locAtt.categoryColumns[0]!.id).toBe("hole_id");
  });

  it("produces dynamic attachments for collections", () => {
    const obj = makeCollectionObject([
      {
        name: "assays",
        collection_type: "interval",
        holes: { width: 3, data_type: "int32", length: 5, data: "h1" },
        from_to: {
          intervals: {
            start_and_end: { width: 2, data_type: "float64", length: 5, data: "ft1" },
          },
          attributes: [],
        },
      },
      {
        name: "survey",
        collection_type: "distance",
        holes: { width: 3, data_type: "int32", length: 8, data: "h2" },
        distance: {
          values: { width: 1, data_type: "float64", length: 8, data: "d1" },
          attributes: [],
        },
      },
    ]);

    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const dynamicIds = supported.attachments
      .filter((a) => a.id.startsWith("collections["))
      .map((a) => a.id);
    expect(dynamicIds).toHaveLength(2);
    expect(dynamicIds).toContain("collections[0]:assays");
    expect(dynamicIds).toContain("collections[1]:survey");

    // interval collection: identity from from_to, with holes as schema column
    const intervalAtt = supported.attachments.find(
      (a) => a.id === "collections[0]:assays",
    )!;
    expect(intervalAtt.identity!.columns).toEqual(["from", "to"]);
    expect(intervalAtt.schemaColumns.map((s) => s.id)).toContain("holes");

    // distance collection: identity from distance.values
    const distAtt = supported.attachments.find(
      (a) => a.id === "collections[1]:survey",
    )!;
    expect(distAtt.identity!.columns).toEqual(["distance"]);
  });

  it("handles all 5 collection sub-table types", () => {
    const obj = makeCollectionObject([
      {
        name: "t1", collection_type: "data",
        holes: { width: 3, data_type: "int32", length: 3, data: "h" },
        attributes: [],
      },
      {
        name: "t2", collection_type: "distance",
        holes: { width: 3, data_type: "int32", length: 3, data: "h" },
        distance: {
          values: { width: 1, data_type: "float64", length: 3, data: "d" },
          attributes: [],
        },
      },
      {
        name: "t3", collection_type: "interval",
        holes: { width: 3, data_type: "int32", length: 3, data: "h" },
        from_to: {
          intervals: {
            start_and_end: { width: 2, data_type: "float64", length: 3, data: "ft" },
          },
          attributes: [],
        },
      },
      {
        name: "t4", collection_type: "planar",
        holes: { width: 3, data_type: "int32", length: 3, data: "h" },
        distance: {
          values: { width: 1, data_type: "float64", length: 3, data: "d" },
          attributes: [],
        },
        relative_plane_angles: { width: 2, data_type: "float64", length: 3, data: "pa" },
        plane_polarity: { width: 1, data_type: "bool", length: 3, data: "pp" },
      },
      {
        name: "t5", collection_type: "lineation",
        holes: { width: 3, data_type: "int32", length: 3, data: "h" },
        distance: {
          values: { width: 1, data_type: "float64", length: 3, data: "d" },
          attributes: [],
        },
        relative_lineation_angles: { width: 3, data_type: "float64", length: 3, data: "la" },
      },
    ]);

    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const dynamicAtts = supported.attachments.filter((a) =>
      a.id.startsWith("collections["),
    );
    expect(dynamicAtts).toHaveLength(5);

    // data_table: no identity
    const dataAtt = dynamicAtts.find((a) => a.id === "collections[0]:t1")!;
    expect(dataAtt.identity).toBeNull();
    expect(dataAtt.schemaColumns.map((s) => s.id)).toContain("holes");

    // planar: has plane_angles + polarity schema columns
    const planarAtt = dynamicAtts.find((a) => a.id === "collections[3]:t4")!;
    expect(planarAtt.identity!.columns).toEqual(["distance"]);
    const planarSchemaIds = planarAtt.schemaColumns.map((s) => s.id);
    expect(planarSchemaIds).toContain("relative_plane_angles");
    expect(planarSchemaIds).toContain("plane_polarity");
    expect(planarSchemaIds).toContain("holes");

    // lineation: has lineation_angles schema column
    const lineAtt = dynamicAtts.find((a) => a.id === "collections[4]:t5")!;
    expect(lineAtt.identity!.columns).toEqual(["distance"]);
    expect(lineAtt.schemaColumns.map((s) => s.id)).toContain(
      "relative_lineation_angles",
    );
  });

  it("matches v1.x.y but not v2", () => {
    const obj = makeCollectionObject();
    for (const v of ["1.0.1", "1.3.1"]) {
      const schema = `/objects/downhole-collection/${v}/downhole-collection.schema.json`;
      expect(describeObject(makeEnvelope(schema, obj, [])).kind).toBe("supported");
    }
    const v2 = "/objects/downhole-collection/2.0.0/downhole-collection.schema.json";
    expect(describeObject(makeEnvelope(v2, obj, [])).kind).toBe("unsupported");
  });
});

// ---------------------------------------------------------------------------
// drilling-campaign — describeObject
// ---------------------------------------------------------------------------

describe("describeObject — drilling-campaign", () => {
  const SCHEMA = "/objects/drilling-campaign/1.0.0/drilling-campaign.schema.json";

  function makeCampaignObject(
    deviationType: "natural" | "mixed",
    options: { withInterim?: boolean; collections?: Record<string, unknown>[] } = {},
  ) {
    const pathNode =
      deviationType === "natural"
        ? {
            deviation_type: "natural",
            width: 6,
            data_type: "float64",
            length: 4,
            data: "nat-path-hash",
            attributes: [],
          }
        : {
            deviation_type: "mixed",
            segment_properties: {
              width: 8,
              data_type: "float64",
              length: 4,
              data: "mixed-seg-hash",
            },
            segment_type: {
              width: 1,
              data_type: "string",
              length: 4,
              data: "seg-type-hash",
            },
            attributes: [],
          };

    const obj: Record<string, unknown> = {
      hole_id: {
        values: { data_type: "int32", length: 4, data: "hid-codes" },
        table: { keys_data_type: "int32", values_data_type: "string", length: 2, data: "hid-lookup" },
      },
      planned: {
        collar: {
          coordinates: { width: 3, data_type: "float64", length: 4, data: "pc-coord" },
          distances: { width: 3, data_type: "float64", length: 4, data: "pc-dist" },
          holes: { width: 3, data_type: "int32", length: 4, data: "pc-holes" },
          attributes: [],
        },
        path: pathNode,
        collections: options.collections ?? [],
      },
      type: "collar",
      distance_unit: "metre",
    };

    if (options.withInterim) {
      obj["interim"] = {
        collar: {
          coordinates: { width: 3, data_type: "float64", length: 2, data: "ic-coord" },
          distances: { width: 3, data_type: "float64", length: 2, data: "ic-dist" },
          holes: { width: 3, data_type: "int32", length: 2, data: "ic-holes" },
          attributes: [],
        },
        path: {
          width: 3,
          data_type: "float64",
          length: 2,
          data: "ip-hash",
          attributes: [],
        },
        collections: [],
      };
    }

    return obj;
  }

  it("produces static + dynamic attachments for natural deviation", () => {
    const obj = makeCampaignObject("natural");
    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);

    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;
    expect(supported.schemaFamily).toBe("drilling-campaign");

    const ids = supported.attachments.map((a) => a.id);
    // Static attachments
    expect(ids).toContain("hole_id");
    expect(ids).toContain("planned.collar");
    // Dynamic: planned.path
    expect(ids).toContain("planned.path");

    // planned.path for natural: 6 identity columns
    const pathAtt = supported.attachments.find((a) => a.id === "planned.path")!;
    expect(pathAtt.identity!.columns).toEqual([
      "distance", "azimuth", "dip",
      "lift_rate", "drift_rate", "deviation_rate_distance",
    ]);
    // No schema columns for natural deviation
    expect(pathAtt.schemaColumns).toEqual([]);
  });

  it("produces mixed deviation with segment_type schema column", () => {
    const obj = makeCampaignObject("mixed");
    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);

    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const pathAtt = supported.attachments.find((a) => a.id === "planned.path")!;
    expect(pathAtt.identity!.columns).toEqual([
      "distance", "azimuth", "dip",
      "lift_rate", "drift_rate", "deviation_rate_distance",
      "toolface_angle", "dogleg_severity",
    ]);

    // segment_type as schema column
    expect(pathAtt.schemaColumns).toHaveLength(1);
    expect(pathAtt.schemaColumns[0]!.id).toBe("segment_type");
  });

  it("includes optional interim attachments when present", () => {
    const obj = makeCampaignObject("natural", { withInterim: true });
    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);

    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const ids = supported.attachments.map((a) => a.id);
    expect(ids).toContain("interim.collar");
    expect(ids).toContain("interim.path");

    const interimCollar = supported.attachments.find(
      (a) => a.id === "interim.collar",
    )!;
    expect(interimCollar.rowCount).toBe(2);
    expect(interimCollar.identity!.columns).toEqual(["x", "y", "z"]);
  });

  it("omits interim attachments when interim is absent", () => {
    const obj = makeCampaignObject("natural");
    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);

    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const ids = supported.attachments.map((a) => a.id);
    expect(ids).not.toContain("interim.collar");
    expect(ids).not.toContain("interim.path");
  });

  it("expands planned.collections with dynamic attachments", () => {
    const obj = makeCampaignObject("natural", {
      collections: [
        {
          name: "lithology",
          collection_type: "interval",
          holes: { width: 3, data_type: "int32", length: 3, data: "h" },
          from_to: {
            intervals: {
              start_and_end: { width: 2, data_type: "float64", length: 3, data: "ft" },
            },
            attributes: [],
          },
        },
      ],
    });

    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const collAtt = supported.attachments.find(
      (a) => a.id === "planned.collections[0]:lithology",
    );
    expect(collAtt).toBeDefined();
    expect(collAtt!.identity!.columns).toEqual(["from", "to"]);
  });

  it("hole_id attachment has category columns but no identity", () => {
    const obj = makeCampaignObject("natural");
    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);

    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const holeIdAtt = supported.attachments.find((a) => a.id === "hole_id")!;
    expect(holeIdAtt.identity).toBeNull();
    expect(holeIdAtt.categoryColumns).toHaveLength(1);
    expect(holeIdAtt.categoryColumns[0]!.id).toBe("hole_id");
  });

  it("matches v1.0.0 but not v2", () => {
    const obj = makeCampaignObject("natural");
    expect(
      describeObject(makeEnvelope(SCHEMA, obj, [])).kind,
    ).toBe("supported");
    expect(
      describeObject(
        makeEnvelope(
          "/objects/drilling-campaign/2.0.0/drilling-campaign.schema.json",
          obj,
          [],
        ),
      ).kind,
    ).toBe("unsupported");
  });
});

// ---------------------------------------------------------------------------
// Composite dtype validation (via downhole-collection describe)
// ---------------------------------------------------------------------------

describe("composite dtype — downhole-collection holes", () => {
  const SCHEMA = "/objects/downhole-collection/1.3.0/downhole-collection.schema.json";

  it("resolves holes schema column with composite dtype", () => {
    const obj = {
      location: {
        coordinates: { width: 3, data_type: "float64", length: 5, data: "coord" },
        distances: { width: 3, data_type: "float64", length: 5, data: "dist" },
        holes: { width: 3, data_type: "int32/uint64/uint64", length: 5, data: "holes" },
        hole_id: {
          values: { data_type: "int32", length: 5, data: "c" },
          table: { keys_data_type: "int32", values_data_type: "string", length: 2, data: "l" },
        },
        path: { width: 3, data_type: "float64", length: 5, data: "p", attributes: [] },
        attributes: [],
      },
      collections: [],
      type: "collar",
      distance_unit: "metre",
      desurvey: "balanced_tangential",
    };

    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const locAtt = supported.attachments.find((a) => a.id === "location")!;
    const holesGroup = locAtt.schemaColumns.find((s) => s.id === "holes")!;
    expect(holesGroup).toBeDefined();
    expect(holesGroup.columns).toEqual(["hole_index", "offset", "count"]);
  });
});

// ---------------------------------------------------------------------------
// buildCollectionAttachments — edge cases
// ---------------------------------------------------------------------------

describe("buildCollectionAttachments — edge cases", () => {
  const SCHEMA = "/objects/downhole-collection/1.3.0/downhole-collection.schema.json";

  it("returns no dynamic attachments for empty collections array", () => {
    const obj = {
      location: {
        coordinates: { width: 3, data_type: "float64", length: 1, data: "c" },
        distances: { width: 3, data_type: "float64", length: 1, data: "d" },
        holes: { width: 3, data_type: "int32", length: 1, data: "h" },
        hole_id: {
          values: { data_type: "int32", length: 1, data: "cv" },
          table: { keys_data_type: "int32", values_data_type: "string", length: 1, data: "cl" },
        },
        path: { width: 3, data_type: "float64", length: 1, data: "p", attributes: [] },
        attributes: [],
      },
      collections: [],
      type: "collar",
      distance_unit: "metre",
      desurvey: "balanced_tangential",
    };

    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    // Only static attachments (location, location.path)
    const dynamicAtts = supported.attachments.filter((a) =>
      a.id.startsWith("collections["),
    );
    expect(dynamicAtts).toHaveLength(0);
  });

  it("uses index-based fallback name when collection has no name", () => {
    const obj = {
      location: {
        coordinates: { width: 3, data_type: "float64", length: 1, data: "c" },
        distances: { width: 3, data_type: "float64", length: 1, data: "d" },
        holes: { width: 3, data_type: "int32", length: 1, data: "h" },
        hole_id: {
          values: { data_type: "int32", length: 1, data: "cv" },
          table: { keys_data_type: "int32", values_data_type: "string", length: 1, data: "cl" },
        },
        path: { width: 3, data_type: "float64", length: 1, data: "p", attributes: [] },
        attributes: [],
      },
      collections: [
        {
          collection_type: "data",
          holes: { width: 3, data_type: "int32", length: 3, data: "h" },
          attributes: [],
        },
      ],
      type: "collar",
      distance_unit: "metre",
      desurvey: "balanced_tangential",
    };

    const envelope = makeEnvelope(SCHEMA, obj, []);
    const desc = describeObject(envelope);
    expect(desc.kind).toBe("supported");
    const supported = desc as SupportedObjectDescription;

    const dataAtt = supported.attachments.find((a) =>
      a.id.startsWith("collections[0]"),
    );
    expect(dataAtt).toBeDefined();
    expect(dataAtt!.id).toBe("collections[0]:collection_0");
  });
});
