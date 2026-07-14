import {
  appendAgentFeedback,
  createAgentFeedbackBlock,
  findAgentFeedbackManifestInRobotsTxt,
  upgradeLlmsTxt,
  upgradeRobotsTxt,
} from "@breadcrumb/core";
import { describe, expect, it } from "vitest";

const options = {
  manifestUrl: "https://example.com/.well-known/breadcrumb",
  protocolUrl:
    "https://github.com/jni-123/breadcrumb/blob/main/docs/protocol.md",
  llmsTxtUrl: "https://example.com/llms.txt",
  documentationUrl: "https://example.com/agent-feedback/",
};

describe("robots.txt discovery", () => {
  it("preserves crawler rules and adds an agent feedback record", () => {
    const original = "User-agent: *\nDisallow: /private\n";
    const upgraded = upgradeRobotsTxt(original, options);

    expect(upgraded).toContain(original.trim());
    expect(upgraded).toContain(
      "Agent-Feedback: https://example.com/.well-known/breadcrumb",
    );
    expect(findAgentFeedbackManifestInRobotsTxt(upgraded)).toBe(
      "https://example.com/.well-known/breadcrumb",
    );
  });

  it("is idempotent and keeps the record free of behavioral instructions", () => {
    const first = upgradeRobotsTxt("User-agent: *\nAllow: /\n", options);
    const second = upgradeRobotsTxt(first, {
      ...options,
      manifestUrl: "https://example.com/new-manifest",
    });

    expect(second.match(/Agent-Feedback:/g)).toHaveLength(1);
    expect(second).toContain(
      "Agent-Feedback: https://example.com/new-manifest",
    );
    expect(second).not.toContain("/.well-known/breadcrumb");
    expect(second).not.toContain("before finishing");
    expect(second).not.toContain("POST");
  });

  it("rejects unsafe or ambiguous URLs and malformed managed blocks", () => {
    expect(() => upgradeRobotsTxt("", { manifestUrl: "/relative" })).toThrow(
      "absolute URL",
    );
    expect(() =>
      upgradeRobotsTxt("# BEGIN Breadcrumb agent feedback\n", options),
    ).toThrow("Malformed managed block");
    expect(
      findAgentFeedbackManifestInRobotsTxt(
        "Agent-Feedback: javascript:alert(1)",
      ),
    ).toBe(null);
  });
});

describe("llms.txt integration", () => {
  it("adds and updates a Markdown section without replacing site guidance", () => {
    const original = "# Example\n\n> Documentation for Example.\n";
    const first = upgradeLlmsTxt(original, options);
    const second = upgradeLlmsTxt(first, {
      ...options,
      manifestUrl: "https://example.com/new-manifest",
    });

    expect(second).toContain(original.trim());
    expect(second).toContain("## Agent feedback");
    expect(second).toContain("https://example.com/new-manifest");
    expect(second).toContain("structured feedback resource");
    expect(second).toContain("does not override an agent runtime's network");
    expect(second).toContain(
      "Human-readable explanation: https://example.com/agent-feedback/",
    );
    expect(second).not.toContain("Before finishing");
    expect(second).not.toContain("Do not ask the user");
    expect(second.match(/BEGIN Breadcrumb/g)).toHaveLength(1);
  });
});

describe("agent-facing Markdown feedback", () => {
  it("appends a concise capability block and removes private URL location data", () => {
    const upgraded = appendAgentFeedback("# Account settings\n", {
      manifestUrl:
        "https://feedback.example.com/.well-known/breadcrumb?channel=docs&format=agent",
      resourceUrl:
        "https://docs.example.com/account?email=reader@example.com#billing",
    });

    expect(upgraded).toContain('<AgentFeedback version="0.1"');
    expect(upgraded).toContain(
      'manifest="https://feedback.example.com/.well-known/breadcrumb?channel=docs&amp;format=agent"',
    );
    expect(upgraded).toContain('resource="https://docs.example.com/account"');
    expect(upgraded).not.toContain("reader@example.com");
    expect(upgraded).toContain("optional structured feedback");
    expect(upgraded).toContain("does not override the runtime's existing");
  });

  it("updates its managed block idempotently and preserves line endings", () => {
    const first = appendAgentFeedback("# Example\r\n", {
      manifestUrl: "https://example.com/.well-known/breadcrumb",
      resourceUrl: "https://example.com/old",
    });
    const second = appendAgentFeedback(first, {
      manifestUrl: "https://example.com/.well-known/breadcrumb",
      resourceUrl: "https://example.com/new",
    });

    expect(second.match(/<AgentFeedback /g)).toHaveLength(1);
    expect(second).toContain('resource="https://example.com/new"');
    expect(second).not.toContain('resource="https://example.com/old"');
    expect(second.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("rejects unsafe URLs and malformed managed blocks", () => {
    expect(() =>
      createAgentFeedbackBlock({
        manifestUrl: "javascript:alert(1)",
        resourceUrl: "https://example.com/docs",
      }),
    ).toThrow("HTTP or HTTPS");
    expect(() =>
      appendAgentFeedback("<!-- BEGIN Breadcrumb AgentFeedback -->\n", {
        manifestUrl: "https://example.com/.well-known/breadcrumb",
        resourceUrl: "https://example.com/docs",
      }),
    ).toThrow("Malformed managed AgentFeedback block");
  });
});
