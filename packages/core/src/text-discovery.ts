const ROBOTS_BEGIN = "# BEGIN Breadcrumb agent feedback";
const ROBOTS_END = "# END Breadcrumb agent feedback";
const LLMS_BEGIN = "<!-- BEGIN Breadcrumb agent feedback -->";
const LLMS_END = "<!-- END Breadcrumb agent feedback -->";

export interface TextDiscoveryOptions {
  manifestUrl: string;
  protocolUrl?: string;
  llmsTxtUrl?: string;
  documentationUrl?: string;
}

const assertWebUrl = (value: string, field: string): string => {
  if (/\r|\n/.test(value))
    throw new Error(`${field} must not contain newlines`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${field} must use HTTP or HTTPS`);
  }
  return url.href;
};

const lineEnding = (text: string): "\n" | "\r\n" =>
  text.includes("\r\n") ? "\r\n" : "\n";

const replaceManagedBlock = (
  existing: string,
  begin: string,
  end: string,
  blockLines: string[],
): string => {
  const eol = lineEnding(existing);
  const block = blockLines.join(eol);
  const start = existing.indexOf(begin);
  const finish = existing.indexOf(end);

  if (start >= 0 !== finish >= 0 || (start >= 0 && finish < start)) {
    throw new Error(
      `Malformed managed block: expected both ${begin} and ${end}`,
    );
  }
  if (start >= 0) {
    const after = finish + end.length;
    return `${existing.slice(0, start)}${block}${existing.slice(after)}`;
  }

  const trimmed = existing.replace(/[\t ]+$/gm, "").replace(/\s*$/, "");
  return `${trimmed}${trimmed.length === 0 ? "" : `${eol}${eol}`}${block}${eol}`;
};

/**
 * Add one declarative RFC 9309-safe extension record to robots.txt.
 * Standards-compliant crawlers ignore the unknown Agent-Feedback record.
 */
export const upgradeRobotsTxt = (
  existing: string,
  options: TextDiscoveryOptions,
): string => {
  const manifestUrl = assertWebUrl(options.manifestUrl, "manifestUrl");
  const eol = lineEnding(existing);
  let cleaned = existing;
  const start = cleaned.indexOf(ROBOTS_BEGIN);
  const finish = cleaned.indexOf(ROBOTS_END);
  if (start >= 0 !== finish >= 0 || (start >= 0 && finish < start)) {
    throw new Error(
      `Malformed managed block: expected both ${ROBOTS_BEGIN} and ${ROBOTS_END}`,
    );
  }
  if (start >= 0) {
    cleaned = `${cleaned.slice(0, start)}${cleaned.slice(finish + ROBOTS_END.length)}`;
  }

  const retained = cleaned
    .split(/\r?\n/)
    .filter((line) => !/^\s*Agent-Feedback\s*:/i.test(line))
    .join(eol)
    .replace(/[\t ]+$/gm, "")
    .replace(/\s*$/, "");
  return `${retained}${retained.length === 0 ? "" : `${eol}${eol}`}Agent-Feedback: ${manifestUrl}${eol}`;
};

export const findAgentFeedbackManifestInRobotsTxt = (
  robotsTxt: string,
): string | null => {
  for (const line of robotsTxt.split(/\r?\n/)) {
    const match = /^\s*Agent-Feedback\s*:\s*(\S+)\s*$/i.exec(line);
    if (match?.[1] === undefined) continue;
    try {
      return assertWebUrl(match[1], "Agent-Feedback");
    } catch {
      continue;
    }
  }
  return null;
};

/** Add a clearly delimited Agent feedback section to the emerging /llms.txt format. */
export const upgradeLlmsTxt = (
  existing: string,
  options: Omit<TextDiscoveryOptions, "llmsTxtUrl">,
): string => {
  const manifestUrl = assertWebUrl(options.manifestUrl, "manifestUrl");
  const protocolUrl =
    options.protocolUrl === undefined
      ? undefined
      : assertWebUrl(options.protocolUrl, "protocolUrl");

  return replaceManagedBlock(existing, LLMS_BEGIN, LLMS_END, [
    LLMS_BEGIN,
    "",
    "## Agent feedback",
    "",
    "This site publishes a structured feedback resource for compatible agents.",
    "The manifest describes its endpoint, accepted report types, privacy limits, and schema.",
    "Availability of the resource does not override an agent runtime's network or trust policy.",
    "",
    `- Manifest: ${manifestUrl}`,
    ...(protocolUrl === undefined
      ? []
      : [`- Protocol reference: ${protocolUrl}`]),
    ...(options.documentationUrl === undefined
      ? []
      : [
          `- Human-readable explanation: ${assertWebUrl(options.documentationUrl, "documentationUrl")}`,
        ]),
    "",
    LLMS_END,
  ]);
};

export const textDiscoveryMarkers = {
  robots: { begin: ROBOTS_BEGIN, end: ROBOTS_END },
  llms: { begin: LLMS_BEGIN, end: LLMS_END },
} as const;
