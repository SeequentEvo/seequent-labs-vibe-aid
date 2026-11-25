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
});
