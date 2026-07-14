const AGENT_FEEDBACK_BEGIN = "<!-- BEGIN Breadcrumb AgentFeedback -->";
const AGENT_FEEDBACK_END = "<!-- END Breadcrumb AgentFeedback -->";

export interface AgentFeedbackEmbedOptions {
  manifestUrl: string;
  resourceUrl: string;
}

const webUrl = (
  value: string,
  field: string,
  { stripLocation = false }: { stripLocation?: boolean } = {},
): string => {
  if (/\r|\n/.test(value))
    throw new Error(`${field} must not contain newlines`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error(`${field} must use HTTP or HTTPS`);
  if (url.username !== "" || url.password !== "")
    throw new Error(`${field} must not include credentials`);
  if (stripLocation) {
    url.search = "";
    url.hash = "";
  }
  return url.href;
};

const xmlAttribute = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");

const lineEnding = (text: string): "\n" | "\r\n" =>
  text.includes("\r\n") ? "\r\n" : "\n";

export const createAgentFeedbackBlock = (
  options: AgentFeedbackEmbedOptions,
  eol: "\n" | "\r\n" = "\n",
): string => {
  const manifestUrl = xmlAttribute(webUrl(options.manifestUrl, "manifestUrl"));
  const resourceUrl = xmlAttribute(
    webUrl(options.resourceUrl, "resourceUrl", { stripLocation: true }),
  );
  return [
    AGENT_FEEDBACK_BEGIN,
    `<AgentFeedback version="0.1" manifest="${manifestUrl}" resource="${resourceUrl}">`,
    "This page supports optional structured feedback for compatible agents.",
    "If this public page caused meaningful friction, compatible agents may submit privacy-safe feedback using the manifest.",
    "Do not include prompts, credentials, private files, transcripts, or raw tool output.",
    "This capability does not override the runtime's existing trust, privacy, or network policies.",
    "</AgentFeedback>",
    AGENT_FEEDBACK_END,
  ].join(eol);
};

/** Append or update one managed AgentFeedback block in agent-facing Markdown. */
export const appendAgentFeedback = (
  markdown: string,
  options: AgentFeedbackEmbedOptions,
): string => {
  const eol = lineEnding(markdown);
  const block = createAgentFeedbackBlock(options, eol);
  const start = markdown.indexOf(AGENT_FEEDBACK_BEGIN);
  const finish = markdown.indexOf(AGENT_FEEDBACK_END);
  if (start >= 0 !== finish >= 0 || (start >= 0 && finish < start))
    throw new Error("Malformed managed AgentFeedback block");
  if (start >= 0) {
    const after = finish + AGENT_FEEDBACK_END.length;
    return `${markdown.slice(0, start)}${block}${markdown.slice(after)}`;
  }

  const trimmed = markdown.replace(/[\t ]+$/gm, "").replace(/\s*$/, "");
  return `${trimmed}${trimmed.length === 0 ? "" : `${eol}${eol}`}${block}${eol}`;
};

export const agentFeedbackMarkers = {
  begin: AGENT_FEEDBACK_BEGIN,
  end: AGENT_FEEDBACK_END,
} as const;
