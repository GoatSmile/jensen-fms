/**
 * Thin Resend transport — one POST to /emails via fetch, no SDK dependency.
 * The API key is a SECRET and stays in env (`RESEND_API_KEY`), unlike the
 * sender identity/test-mode config, which lives in app_settings
 * (src/lib/communication/settings.ts) per the config-vs-secrets rule.
 *
 * Callers are expected to have already run resolveRecipients() so test-mode
 * rerouting happened before this layer — this function sends to exactly the
 * addresses it's given.
 */

export type SendEmailInput = {
  from: string;
  to: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
};

export type SendEmailResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

export async function sendViaResend(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "RESEND_API_KEY is not set — create the Resend account, add the key to .env.local (and Vercel), and restart the dev server.",
    };
  }
  if (input.to.length === 0) {
    return { ok: false, error: "No recipients." };
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        html: input.html,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach the email provider: ${e instanceof Error ? e.message : "network error"}`,
    };
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = body.message;
    } catch {
      // Non-JSON error body — keep the status code.
    }
    return { ok: false, error: `Email provider rejected the send: ${detail}` };
  }

  const body = (await res.json()) as { id?: string };
  return { ok: true, providerId: body.id ?? "unknown" };
}
