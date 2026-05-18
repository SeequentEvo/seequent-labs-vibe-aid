import { describe, it, expect } from "vitest";
import { selectEvoUser } from "@/store/authSlice";
import type { UserInfo } from "@/api/auth/ims";

/**
 * Helper to build test state with sensible defaults.
 * If userOverrides is provided, merges with defaults and sets user.
 * If not provided, sets user to null (for testing null case).
 */
function makeState(userOverrides?: Partial<UserInfo>) {
  const defaultUser: UserInfo = {
    sub: "user-123",
    given_name: "John",
    family_name: "Doe",
    email: "john@example.com",
    preferred_username: "johndoe",
  };

  return {
    auth: {
      status: "authenticated" as const,
      accessToken: "token",
      idToken: "id-token",
      user: userOverrides ? { ...defaultUser, ...userOverrides } : null,
      error: null,
      expiresAt: null,
    },
  };
}

describe("selectEvoUser", () => {
  it("returns null when user is null", () => {
    const state = makeState();
    const result = selectEvoUser(state);
    expect(result).toBeNull();
  });

  it("composes name from given_name + family_name when both present", () => {
    const state = makeState({
      sub: "user-123",
      given_name: "John",
      family_name: "Doe",
    });
    const result = selectEvoUser(state);
    expect(result?.name).toBe("John Doe");
  });

  it("uses only given_name when family_name is absent", () => {
    const state = makeState({
      sub: "user-123",
      given_name: "John",
      family_name: undefined,
    });
    const result = selectEvoUser(state);
    expect(result?.name).toBe("John");
  });

  it("uses only family_name when given_name is absent", () => {
    const state = makeState({
      sub: "user-123",
      given_name: undefined,
      family_name: "Doe",
    });
    const result = selectEvoUser(state);
    expect(result?.name).toBe("Doe");
  });

  it("falls back to preferred_username when both names are absent", () => {
    const state = makeState({
      sub: "user-123",
      given_name: undefined,
      family_name: undefined,
      preferred_username: "johndoe",
    });
    const result = selectEvoUser(state);
    expect(result?.name).toBe("johndoe");
  });

  it("falls back to email when names and preferred_username are absent", () => {
    const state = makeState({
      sub: "user-123",
      given_name: undefined,
      family_name: undefined,
      preferred_username: undefined,
      email: "john@example.com",
    });
    const result = selectEvoUser(state);
    expect(result?.name).toBe("john@example.com");
  });

  it("falls back to Unknown when no name source at all", () => {
    const state = makeState({
      sub: "user-123",
      given_name: undefined,
      family_name: undefined,
      preferred_username: undefined,
      email: undefined,
    });
    const result = selectEvoUser(state);
    expect(result?.name).toBe("Unknown");
  });

  it("defaults email to empty string when claim absent", () => {
    const state = makeState({
      sub: "user-123",
      given_name: "John",
      email: undefined,
    });
    const result = selectEvoUser(state);
    expect(result?.email).toBe("");
  });

  it("throws when sub is empty string", () => {
    const state = makeState({
      sub: "",
      given_name: "John",
    });
    expect(() => selectEvoUser(state)).toThrow();
  });
});
