import { NextResponse } from "next/server";

import { askAssistant } from "@/lib/assistant/command-request";
import { readGate } from "@/lib/auth/read-session";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The spoken secretary's request, STREAMED (2026-10-22): the same work as the
 * `createCommandFromText` action (`askAssistant`), but the reply's sentences
 * are sent as the model writes them, so the phone starts speaking about a
 * second sooner — then the whole result, exactly what the action returns.
 *
 * Newline-delimited JSON: `{"sentence":"…"}` per finished sentence, then one
 * `{"result":{…}}`. What the CODE adds after the model (a booking that failed,
 * a delete waiting for a yes) is in the result's stored answer only; the
 * phone says it after the sentences. Middleware skips /api, so this
 * authenticates itself; the person and their rights come from the session
 * inside `askAssistant`, as for the action.
 */
export async function POST(request: Request) {
  const gate = await readGate();
  if (gate.kind === "anonymous") {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    priorId?: unknown;
    history?: unknown;
    language?: unknown;
    page?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ ok: false, reason: "no_body" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          /* the phone went away; the request still finishes and is stored */
        }
      };
      try {
        const result = await askAssistant(
          text,
          typeof body?.priorId === "string" ? body.priorId : null,
          {
            spoken: true,
            history: Array.isArray(body?.history) ? body.history.filter((x): x is string => typeof x === "string") : undefined,
            language: typeof body?.language === "string" ? body.language : undefined,
            page: typeof body?.page === "string" ? body.page : undefined,
          },
          (sentence) => send({ sentence }),
        );
        send({ result });
      } catch (e) {
        console.error("[secretary]", e);
        send({ result: { ok: false, error: e instanceof Error ? e.message : String(e) } });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
