import axios from "axios";

/**
 * Robust Telegram sender shared by the Cloud Functions.
 *
 * Handles the two failure modes that used to lose a whole aggregated Spot cycle:
 *  - an entity/Markdown error in the message (HTTP 400) -> the same chunk is
 *    resent once as plain text instead of retrying the rejected payload.
 *  - a message longer than Telegram's 4096-char limit -> it is split into
 *    several chunks that are sent in order.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

export const TELEGRAM_MAX_CHUNK_LEN = 3800;

/** Backoff between retries (same values the previous implementation used). */
const RETRY_DELAYS_MS = [2000, 4000];
const MAX_ATTEMPTS = 3;
/** 429 retry_after is honored but capped, so a cycle never stalls for long. */
const MAX_RETRY_AFTER_MS = 5000;

export interface TelegramSendResult {
    status: number;
    data?: any;
}

export interface TelegramDeps {
    post?: (url: string, body: any) => Promise<TelegramSendResult>;
    token?: string;
    chatId?: string;
    sleep?: (ms: number) => Promise<void>;
}

interface AttemptOutcome {
    ok: boolean;
    status?: number;
    description?: string;
    retryAfterMs?: number;
}

const defaultSleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

/** Trims only leading/trailing newlines (including CRLF), never other content. */
function trimNewlines(value: string): string {
    return value.replace(/^(?:\r?\n)+/, "").replace(/(?:\r?\n)+$/, "");
}

/**
 * Splits `text` into chunks of at most `maxLen` characters.
 *
 * Boundaries are preferred in this order: a blank line ("\n\n"), then a single
 * newline, then a hard cut at `maxLen`. Chunks only have their surrounding
 * newlines trimmed, and no empty chunk is ever returned.
 */
export function splitTelegramMessage(text: string, maxLen: number = TELEGRAM_MAX_CHUNK_LEN): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let rest = text;

    while (rest.length > maxLen) {
        const window = rest.slice(0, maxLen);

        let cut = window.lastIndexOf("\n\n");
        if (cut <= 0) cut = window.lastIndexOf("\n");
        if (cut <= 0) cut = maxLen; // last resort: hard cut

        const candidate = trimNewlines(rest.slice(0, cut));
        rest = rest.slice(cut);

        // The window held only newlines: consume it without emitting a chunk.
        if (candidate.length === 0) continue;
        chunks.push(candidate);
    }

    const tail = trimNewlines(rest);
    if (tail.length > 0) chunks.push(tail);

    // Pathological input (only newlines): still never return an empty chunk.
    if (chunks.length === 0) chunks.push(text.slice(0, maxLen));

    return chunks;
}

function describeError(e: any): { status?: number; description: string; retryAfterMs?: number } {
    const status: number | undefined = typeof e?.response?.status === "number" ? e.response.status : undefined;
    const data = e?.response?.data;

    let description = "unknown error";
    if (data && typeof data.description === "string" && data.description.length > 0) {
        description = data.description;
    } else if (data && typeof data.error === "string" && data.error.length > 0) {
        description = data.error;
    } else if (typeof e?.message === "string" && e.message.length > 0) {
        description = e.message;
    }

    const retryAfter = Number(data?.parameters?.retry_after);
    const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
        : undefined;

    return { status, description: description.slice(0, 300), retryAfterMs };
}

/** One POST attempt. Never throws. */
async function attemptSend(
    post: (url: string, body: any) => Promise<TelegramSendResult>,
    url: string,
    chatId: string,
    text: string,
    markdown: boolean
): Promise<AttemptOutcome> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (markdown) body.parse_mode = "Markdown";
    body.disable_web_page_preview = true;

    try {
        const resp = await post(url, body);
        const status = typeof resp?.status === "number" ? resp.status : 200;
        if (status >= 400) {
            const data: any = resp?.data;
            const description = (data && typeof data.description === "string" && data.description.length > 0)
                ? data.description
                : `HTTP ${status}`;
            return { ok: false, status, description: description.slice(0, 300) };
        }
        return { ok: true, status };
    } catch (e: any) {
        const info = describeError(e);
        return { ok: false, status: info.status, description: info.description, retryAfterMs: info.retryAfterMs };
    }
}

/**
 * Sends `text` (splitting it if needed) and returns true only when every chunk
 * was delivered. Never throws.
 */
export async function sendTelegramMessage(text: string, deps: TelegramDeps = {}): Promise<boolean> {
    const token = deps.token ?? process.env.TELEGRAM_TOKEN;
    const chatId = deps.chatId ?? process.env.TELEGRAM_CHAT_ID;
    const post = deps.post ?? ((url: string, body: any) => axios.post(url, body));
    const sleep = deps.sleep ?? defaultSleep;

    if (!token || !chatId) {
        console.error("[Telegram] Faltan credenciales.");
        return false;
    }

    const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
    const chunks = splitTelegramMessage(text);

    try {
        for (const chunk of chunks) {
            let markdown = true;
            let attempt = 1;

            while (attempt <= MAX_ATTEMPTS) {
                const outcome = await attemptSend(post, url, chatId, chunk, markdown);

                if (outcome.ok) {
                    console.log(`[Telegram] Mensaje enviado OK (status ${outcome.status}, attempt ${attempt})`);
                    break;
                }

                // Telegram rejected the entities/text: resend the same chunk as
                // plain text instead of repeating a payload that will always fail.
                if (outcome.status === 400 && markdown) {
                    console.log(`[Telegram] Markdown rejected, resent as plain text: ${outcome.description}`);
                    markdown = false;
                    attempt = 1;
                    continue;
                }

                console.error(`[Telegram] Intento ${attempt} fallido: ${outcome.description}`);
                if (attempt >= MAX_ATTEMPTS) {
                    console.error("[Telegram] Fallo definitivo al enviar un fragmento.");
                    return false; // do not send later chunks
                }

                const delay = outcome.retryAfterMs ?? RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
                await sleep(delay);
                attempt++;
            }
        }

        return true;
    } catch (e: any) {
        console.error("[Telegram] Error inesperado al enviar:", e?.message ?? "unknown error");
        return false;
    }
}
