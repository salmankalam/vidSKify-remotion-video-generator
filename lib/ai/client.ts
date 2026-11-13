const DEFAULT_BASE_URL = "https://api.apinex.bond/v1";
const DEFAULT_MODEL = "free/deepseek-v4.1-flash";

/** The gateway is OpenAI-compatible, so only the base URL and key change. */
export function aiBaseUrl() {
  return (process.env.APINEX_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Only `free/…` models are used. APInex also lists paid ids and subscription-only
 * "free" ids; the prefix plus this default keeps the app on the free allowance.
 */
export function aiModel() {
  return process.env.APINEX_TEXT_MODEL?.trim() || DEFAULT_MODEL;
}

export function hasAI() {
  return Boolean(process.env.APINEX_API_KEY?.trim());
}

export class AIError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AIError";
    this.status = status;
  }
}

type ImageInput = { dataUrl: string };
type JsonMode = "json_schema" | "json_object" | "plain";

/**
 * One structured-output chat call.
 *
 * Gateways differ in which structured-output flags they honour, so a rejected
 * `response_format` is retried with a weaker mode instead of failing the whole
 * brief. Plain `fetch` keeps model/payload changes dependency-free.
 */
export async function chatJSON<T>(options: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  schemaName: string;
  images?: ImageInput[];
  temperature?: number;
}): Promise<T> {
  const key = process.env.APINEX_API_KEY?.trim();
  if (!key) throw new AIError("APINEX_API_KEY is not set", 400);

  const content: any[] = [{ type: "text", text: options.user }];
  for (const image of options.images ?? []) {
    content.push({ type: "image_url", image_url: { url: image.dataUrl, detail: "high" } });
  }

  const modes: JsonMode[] = ["json_schema", "json_object", "plain"];

  for (let attempt = 0; attempt < modes.length; attempt += 1) {
    const mode = modes[attempt];
    const body: Record<string, unknown> = {
      model: aiModel(),
      temperature: options.temperature ?? 0.8,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content },
      ],
    };
    if (mode === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: options.schemaName, strict: true, schema: options.schema },
      };
    } else if (mode === "json_object") {
      body.response_format = { type: "json_object" };
    } else {
      body.messages = [
        {
          role: "system",
          content: `${options.system}\n\nReturn one JSON object and nothing else. No prose, no markdown fences.`,
        },
        { role: "user", content },
      ];
    }

    const response = await post(key, body);
    if (!response.ok) {
      const detail = await safeText(response);
      const retryable = isFormatRejection(response.status, detail);
      if (retryable && attempt < modes.length - 1) continue;
      throw new AIError(explainError(response.status, detail), response.status);
    }

    const payload: any = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) {
      if (attempt < modes.length - 1) continue;
      throw new AIError("The model returned an empty response. Try again.");
    }

    const parsed = parseJsonLoose(raw);
    if (parsed.ok) return parsed.value as T;
    if (attempt < modes.length - 1) continue;
    throw new AIError(
      `The model replied with text instead of JSON (${raw.trim().slice(0, 90)}…). Try again.`,
    );
  }

  throw new AIError("The model could not produce a structured plan.", 502);
}

async function post(key: string, body: Record<string, unknown>) {
  try {
    return await fetch(`${aiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error: any) {
    throw new AIError(`Could not reach the AI gateway: ${error?.message ?? "network error"}`);
  }
}

/** A capability complaint we can work around by sending a simpler payload. */
function isFormatRejection(status: number, detail: string) {
  if (status !== 400 && status !== 404 && status !== 422) return false;
  return /json_schema|response_format|structured|schema|not support|unsupported/i.test(detail);
}

function parseJsonLoose(raw: string): { ok: true; value: unknown } | { ok: false } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    /* fall through to brace extraction */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return { ok: true, value: JSON.parse(cleaned.slice(start, end + 1)) };
    } catch {
      /* not recoverable */
    }
  }
  return { ok: false };
}

async function safeText(response: Response) {
  try {
    return (await response.text()).slice(0, 600);
  } catch {
    return "";
  }
}

function explainError(status: number, body: string) {
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? parsed?.message ?? body;
  } catch {
    /* keep raw */
  }
  if (status === 401 || status === 403) {
    return "APInex rejected the key. Check APINEX_API_KEY in .env.";
  }
  if (status === 402) return "Your APInex balance is empty. Free models need a topped-up account.";
  if (status === 404 && /model/i.test(detail)) {
    return `Model "${aiModel()}" is not available on APInex. Set APINEX_TEXT_MODEL to a free/ model.`;
  }
  if (status === 429) {
    return "Free-tier rate limit reached (APInex allows 15 requests/min). Wait a moment and retry.";
  }
  return `AI gateway error ${status}: ${String(detail).slice(0, 300)}`;
}
