// What a clickable activity chip can honestly show: the fields already on
// the persisted tool object. The harness records `{ name, ok, spoken }` on
// most chips; extra keys (input, args, output, result) are rendered when
// they were already stored, and otherwise omitted.

const KEY_PREFIXES: RegExp[] = [
  /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bnpm_[A-Za-z0-9]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];
const BEARER = /(\bBearer\s+)([A-Za-z0-9._~+/=-]{12,})/g;
const KEY_VALUE =
  /\b((?:[A-Za-z0-9_-]*_)?(?:api[_-]?key|apikey|secret|token|password|passwd|authorization|auth[_-]?token|access[_-]?key|private[_-]?key)s?)(["']?\s*[=:]\s*)(["']?)([A-Za-z0-9._~+/=-]{8,})\3/gi;

const mask = (value: string) => `«redacted ${value.length} chars»`;
const MAX_VALUE_CHARS = 100_000;

export function redactToolText(text: string): string {
  if (text.length < 8) return clip(text);
  let out = text;
  for (const re of KEY_PREFIXES) out = out.replace(re, (m) => mask(m));
  out = out.replace(BEARER, (_m, lead: string, tok: string) => `${lead}${mask(tok)}`);
  out = out.replace(
    KEY_VALUE,
    (_m, key: string, sep: string, quote: string, value: string) => `${key}${sep}${quote}${mask(value)}${quote}`,
  );
  return clip(out);
}

function clip(text: string): string {
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}\n…truncated` : text;
}

export type ToolCallStatus = "running" | "ok" | "error";

export interface ToolCallField {
  key: string;
  label: string;
  value: string;
}

export interface ToolCallDetails {
  name: string;
  status: ToolCallStatus;
  statusLabel: string;
  spoken?: string;
  setup?: boolean;
  fields: ToolCallField[];
}

export type ToolCallTool = {
  name: string;
  ok?: boolean;
  spoken?: string;
  setup?: boolean;
  input?: string;
  args?: string;
  arguments?: string;
  output?: string;
  result?: string;
};

function pushField(fields: ToolCallField[], key: string, label: string, value: string | undefined): void {
  if (value === undefined || value === "") return;
  fields.push({ key, label, value: redactToolText(value) });
}

export function toolCallDetails(tool: ToolCallTool): ToolCallDetails {
  const status: ToolCallStatus = tool.ok === false ? "error" : tool.ok === true ? "ok" : "running";
  const statusLabel = status === "error" ? "Error" : status === "ok" ? "OK" : "Running";
  const fields: ToolCallField[] = [];
  pushField(fields, "input", "Input", tool.input);
  pushField(fields, "args", "Arguments", tool.args);
  pushField(fields, "arguments", "Arguments", tool.arguments);
  pushField(fields, "output", "Output", tool.output);
  pushField(fields, "result", "Result", tool.result);
  const spoken = tool.spoken?.trim() ? tool.spoken : undefined;
  return {
    name: tool.name,
    status,
    statusLabel,
    spoken,
    setup: tool.setup,
    fields,
  };
}
