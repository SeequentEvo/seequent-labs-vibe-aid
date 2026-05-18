import { describe, expect, it } from "vitest";

import { resolveIdentity, resolveSchemaColumns, resolveCategoryColumns } from "./identity";
import type { AttachmentBlueprint } from "./schemas/types";
import type { PerEnvelopeError } from "./types";

// ---------------------------------------------------------------------------
// Blueprint helpers
// ---------------------------------------------------------------------------

const identityBlueprint: AttachmentBlueprint = {
  id: "test",
  jsonPath: ["test"],
  identityFrom: { path: ["coordinates"], columns: ["x", "y", "z"] },
};

const schemaColumnBlueprint: AttachmentBlueprint = {
  id: "test",
  jsonPath: ["test"],
  schemaColumns: [
    {
      id: "normals",
      label: "Normals",
      path: ["normals"],
      columns: ["nx", "ny", "nz"],
    },
  ],
};

const categoryBlueprint: AttachmentBlueprint = {
  id: "test",
  jsonPath: ["test"],
  categoryColumns: [
    {
      id: "hole_id",
      label: "Hole ID",
      path: ["hole_id"],
    },
  ],
};

// ---------------------------------------------------------------------------
// resolveIdentity
// ---------------------------------------------------------------------------

describe("resolveIdentity", () => {
  it("returns a blob ref for a normal element", () => {
    const node = { coordinates: { data: "hash123", length: 5, width: 3, data_type: "float64" } };
    const errors: PerEnvelopeError[] = [];

    const result = resolveIdentity(node, identityBlueprint, errors);

    expect(errors).toHaveLength(0);
    expect(result).toEqual({
      kind: "blob",
      blobRef: "hash123",
      rowCount: 5,
      columns: ["x", "y", "z"],
      elementSchema: { dataType: "float64", width: 3 },
    });
  });

  it("returns an empty ref when data is null and length is 0", () => {
    const node = { coordinates: { data: null, length: 0, width: 3, data_type: "float64" } };
    const errors: PerEnvelopeError[] = [];

    const result = resolveIdentity(node, identityBlueprint, errors);

    expect(errors).toHaveLength(0);
    expect(result).toEqual({
      kind: "empty",
      rowCount: 0,
      columns: ["x", "y", "z"],
      elementSchema: { dataType: "float64", width: 3 },
    });
  });

  it("pushes an error when data is null with length > 0", () => {
    const node = { coordinates: { data: null, length: 5, width: 3, data_type: "float64" } };
    const errors: PerEnvelopeError[] = [];

    const result = resolveIdentity(node, identityBlueprint, errors);

    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.scope).toBe("identity");
    expect(errors[0]!.message).toContain("length");
    expect(errors[0]!.message).toContain("> 0");
  });

  it("pushes an error when data is null with missing width", () => {
    const node = { coordinates: { data: null, length: 0, data_type: "float64" } };
    const errors: PerEnvelopeError[] = [];

    const result = resolveIdentity(node, identityBlueprint, errors);

    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("width");
  });

  it("pushes an error when data is null with missing length", () => {
    const node = { coordinates: { data: null, width: 3, data_type: "float64" } };
    const errors: PerEnvelopeError[] = [];

    const result = resolveIdentity(node, identityBlueprint, errors);

    expect(result).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("length");
  });

  it("returns null when blueprint has no identityFrom", () => {
    const blueprint: AttachmentBlueprint = { id: "test", jsonPath: ["test"] };
    const errors: PerEnvelopeError[] = [];

    const result = resolveIdentity({}, blueprint, errors);

    expect(result).toBeNull();
    expect(errors).toHaveLength(0);
  });

  it("returns null when the element node is missing", () => {
    const errors: PerEnvelopeError[] = [];

    const result = resolveIdentity({}, identityBlueprint, errors);

    expect(result).toBeNull();
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveSchemaColumns
// ---------------------------------------------------------------------------

describe("resolveSchemaColumns", () => {
  it("returns a blob descriptor for a normal element", () => {
    const node = { normals: { data: "hash456", length: 10, width: 2, data_type: "float64" } };
    const errors: PerEnvelopeError[] = [];

    const result = resolveSchemaColumns(node, schemaColumnBlueprint, errors);

    expect(errors).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "blob",
      id: "normals",
      label: "Normals",
      columns: ["nx", "ny", "nz"],
      blobRef: "hash456",
      rowCount: 10,
      elementSchema: { dataType: "float64", width: 2 },
    });
  });

  it("returns an empty descriptor when data is null and length is 0", () => {
    const node = { normals: { data: null, length: 0, width: 2, data_type: "float64" } };
    const errors: PerEnvelopeError[] = [];

    const result = resolveSchemaColumns(node, schemaColumnBlueprint, errors);

    expect(errors).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "empty",
      id: "normals",
      label: "Normals",
      columns: ["nx", "ny", "nz"],
      rowCount: 0,
      elementSchema: { dataType: "float64", width: 2 },
    });
  });

  it("pushes an error and skips when data is null with length > 0", () => {
    const node = { normals: { data: null, length: 5, width: 2, data_type: "float64" } };
    const errors: PerEnvelopeError[] = [];

    const result = resolveSchemaColumns(node, schemaColumnBlueprint, errors);

    expect(result).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.scope).toBe("schemaColumnGroup");
    expect(errors[0]!.message).toContain("> 0");
  });

  it("returns an empty array when blueprint has no schemaColumns", () => {
    const blueprint: AttachmentBlueprint = { id: "test", jsonPath: ["test"] };
    const errors: PerEnvelopeError[] = [];

    const result = resolveSchemaColumns({}, blueprint, errors);

    expect(result).toEqual([]);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveCategoryColumns
// ---------------------------------------------------------------------------

describe("resolveCategoryColumns", () => {
  it("returns a blob descriptor when both values and table have data", () => {
    const node = {
      hole_id: {
        values: { data: "v-hash", length: 5 },
        table: { data: "t-hash" },
      },
    };
    const errors: PerEnvelopeError[] = [];

    const result = resolveCategoryColumns(node, categoryBlueprint, errors);

    expect(errors).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "blob",
      id: "hole_id",
      label: "Hole ID",
      codesBlobRef: "v-hash",
      lookupBlobRef: "t-hash",
      rowCount: 5,
    });
  });

  it("returns an empty descriptor when both values and table data are null", () => {
    const node = {
      hole_id: {
        values: { data: null, length: 0 },
        table: { data: null },
      },
    };
    const errors: PerEnvelopeError[] = [];

    const result = resolveCategoryColumns(node, categoryBlueprint, errors);

    expect(errors).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "empty",
      id: "hole_id",
      label: "Hole ID",
      rowCount: 0,
    });
  });

  it("pushes an error when values is null but table has data", () => {
    const node = {
      hole_id: {
        values: { data: null, length: 0 },
        table: { data: "t-hash" },
      },
    };
    const errors: PerEnvelopeError[] = [];

    const result = resolveCategoryColumns(node, categoryBlueprint, errors);

    expect(result).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.scope).toBe("categoryColumn");
    expect(errors[0]!.message).toContain("one-sided null");
  });

  it("pushes an error when values has data but table is null", () => {
    const node = {
      hole_id: {
        values: { data: "v-hash", length: 5 },
        table: { data: null },
      },
    };
    const errors: PerEnvelopeError[] = [];

    const result = resolveCategoryColumns(node, categoryBlueprint, errors);

    expect(result).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("one-sided null");
  });

  it("pushes an error when both are null but length > 0", () => {
    const node = {
      hole_id: {
        values: { data: null, length: 3 },
        table: { data: null },
      },
    };
    const errors: PerEnvelopeError[] = [];

    const result = resolveCategoryColumns(node, categoryBlueprint, errors);

    expect(result).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("> 0");
  });

  it("returns an empty array when blueprint has no categoryColumns", () => {
    const blueprint: AttachmentBlueprint = { id: "test", jsonPath: ["test"] };
    const errors: PerEnvelopeError[] = [];

    const result = resolveCategoryColumns({}, blueprint, errors);

    expect(result).toEqual([]);
    expect(errors).toHaveLength(0);
  });
});
