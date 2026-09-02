import { describe, expect, it } from "vitest";

import { toolCallDetails } from "./tool-call";

describe("toolCallDetails", () => {
  it("surfaces name, outcome and spoken when that is all the chip recorded", () => {
    const details = toolCallDetails({ name: "Bash: ls -la", ok: true, spoken: "running a command" });
    expect(details).toMatchObject({
      name: "Bash: ls -la",
      status: "ok",
      statusLabel: "OK",
      spoken: "running a command",
    });
    expect(details.fields).toEqual([]);
  });

  it("treats a missing ok as still running, and ok:false as an error", () => {
    expect(toolCallDetails({ name: "Read" }).status).toBe("running");
    expect(toolCallDetails({ name: "Read", ok: false, setup: true })).toMatchObject({
      status: "error",
      statusLabel: "Error",
      setup: true,
    });
  });

  it("renders input/output (and aliases) when they are already on the tool object", () => {
    const details = toolCallDetails({
      name: "browser.search",
      ok: true,
      input: JSON.stringify({ query: "openmausbot" }, null, 2),
      output: JSON.stringify("12 results", null, 2),
    });
    expect(details.fields.map((f) => f.label)).toEqual(["Input", "Output"]);
    expect(details.fields[0]?.value).toContain("openmausbot");
    expect(details.fields[1]?.value).toContain("12 results");
  });

  it("does not dump secrets from recorded arguments", () => {
    const details = toolCallDetails({
      name: "Bash",
      ok: true,
      input: JSON.stringify({
        command: "curl -H 'Authorization: Bearer supersecretvalue'",
        api_key: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
      }, null, 2),
    });
    const blob = details.fields.map((f) => f.value).join("\n");
    expect(blob).not.toContain("supersecretvalue");
    expect(blob).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    expect(blob).toContain("«redacted");
  });
});
