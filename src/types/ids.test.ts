import { describe, it, expect } from "vitest";
import type { OrgId, WorkspaceId, VersionId, UUID } from "./ids";
import {
  parseOrgId,
  parseVersionId,
  tryParseOrgId,
  tryParseVersionId,
} from "./ids";

const V4_UUID = "550e8400-e29b-41d4-a716-446655440000";
const V7_UUID = "0190d4c1-890c-7b8a-8c4a-6e6b6a2b5c3d";

describe("UUID brands", () => {
  it("accepts v4 UUIDs", () => {
    expect(parseOrgId(V4_UUID)).toBe(V4_UUID);
  });

  it("accepts v7 UUIDs", () => {
    expect(parseOrgId(V7_UUID)).toBe(V7_UUID);
  });

  it("rejects malformed strings", () => {
    expect(() => parseOrgId("not-a-uuid")).toThrow();
  });

  it("rejects empty strings", () => {
    expect(() => parseOrgId("")).toThrow();
  });
});

describe("Opaque brands", () => {
  it("accepts arbitrary non-empty strings", () => {
    expect(parseVersionId("v1.0.0-opaque-handle")).toBe(
      "v1.0.0-opaque-handle",
    );
    expect(parseVersionId("some-uuid-shaped-thing")).toBe(
      "some-uuid-shaped-thing",
    );
  });

  it("accepts UUID-shaped strings too", () => {
    expect(parseVersionId(V4_UUID)).toBe(V4_UUID);
  });

  it("rejects empty strings", () => {
    expect(() => parseVersionId("")).toThrow();
  });
});

describe("tryParse helpers", () => {
  it("returns null for invalid input", () => {
    expect(tryParseOrgId("bad")).toBeNull();
    expect(tryParseVersionId("")).toBeNull();
  });

  it("returns the branded value for valid input", () => {
    expect(tryParseOrgId(V4_UUID)).toBe(V4_UUID);
    expect(tryParseVersionId("hello")).toBe("hello");
  });
});

describe("Type safety", () => {
  it("OrgId is assignable to UUID", () => {
    const org: OrgId = parseOrgId(V4_UUID);
    const _uuid: UUID = org; // should compile — OrgId extends UUID
    expect(_uuid).toBe(V4_UUID);
  });

  it("OrgId is NOT assignable to WorkspaceId", () => {
    const org: OrgId = parseOrgId(V4_UUID);
    // @ts-expect-error OrgId should not be assignable to WorkspaceId
    const _ws: WorkspaceId = org;
    expect(_ws).toBe(V4_UUID);
  });

  it("VersionId is NOT assignable to UUID", () => {
    const ver: VersionId = parseVersionId("v1");
    // @ts-expect-error VersionId should not be assignable to UUID
    const _uuid: UUID = ver;
    expect(_uuid).toBe("v1");
  });
});
