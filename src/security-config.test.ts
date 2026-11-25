import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("security configuration", () => {
  it("uses least-privilege default OAuth scopes", () => {
    const env = read(".env.example");
    expect(env).toContain('VITE_IMS_SCOPES="evo.discovery evo.workspace"');
    expect(env).not.toContain("evo.object evo.file evo.blocksync");
  });

  it("pins CSP blob transfers without broad HTTPS wildcards", () => {
    const html = read("index.html");
    expect(html).toContain("https://*.blob.core.windows.net");
    expect(html).not.toMatch(/connect-src[^;]*\shttps:\s/i);
    expect(html).not.toContain("connect-src 'self' https://*;");
  });

  it("contains AppSec guardrails for generated code", () => {
    const agents = read("AGENTS.md");
    expect(agents).toContain("dangerouslySetInnerHTML");
    expect(agents).toContain("discovered Evo instances");
    expect(agents).toContain("Every `VITE_*` variable");
  });

  it("lints eval and unsafe HTML patterns", () => {
    const eslint = read("eslint.config.js");
    expect(eslint).toContain("'no-eval': 'error'");
    expect(eslint).toContain("'no-implied-eval': 'error'");
    expect(eslint).toContain('dangerouslySetInnerHTML');
  });

  it("requires confirmation for logout and fixed error codes", () => {
    const logout = read("src/pages/Logout.tsx");
    const callback = read("src/pages/Callback.tsx");
    const error = read("src/pages/Error.tsx");
    expect(logout).not.toMatch(/useEffect\s*[\s\S]*window\.location\.href/);
    expect(logout).toContain("Sign out?");
    expect(callback).not.toContain("/error?message=");
    expect(error).not.toContain("useSearchParams");
  });

  it("provides production security headers and disclosure tooling", () => {
    const netlify = read("public/_headers");
    const vercel = read("vercel.json");
    const security = read("SECURITY.md");
    const ci = read(".github/workflows/ci.yml");
    for (const headers of [netlify, vercel]) {
      expect(headers).toContain("frame-ancestors 'none'");
      expect(headers).toContain("Strict-Transport-Security");
      expect(headers).toContain("X-Content-Type-Options");
      expect(headers).toContain("Cross-Origin-Opener-Policy");
      expect(headers).toContain("Permissions-Policy");
    }
    expect(security).toContain("Private vulnerability reporting");
    expect(ci).toContain("npm audit --audit-level=high");
  });
});
