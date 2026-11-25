import { describe, expect, it } from "vitest";
import { decodeJwtClaims } from "./ims";

function encodePayload(payload: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("decodeJwtClaims", () => {
  it("decodes UTF-8 claims and missing base64 padding", () => {
    const payload = encodePayload({
      sub: "user-123",
      given_name: "Zoë",
      family_name: "Ångström",
    });

    expect(decodeJwtClaims(`header.${payload}.signature`)).toMatchObject({
      sub: "user-123",
      given_name: "Zoë",
      family_name: "Ångström",
    });
  });

  it("rejects JWT payloads with no payload segment", () => {
    expect(() => decodeJwtClaims("header.")).toThrow("missing payload");
  });
});
