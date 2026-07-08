// Live NEXUS event stream (Server-Sent Events). Emits fresh log entries and
// occasional governor decision ticks so `tail`/`top` feel like a live ops feed.

import { nextGovernorTick, nextLogEntry } from "@/lib/nexus/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // initial hello
      send({ type: "hello", ts: new Date().toISOString(), message: "nexus live stream connected" });

      // log tick every ~1.6s
      const logTimer = setInterval(() => {
        if (closed) return;
        send({ type: "log", entry: nextLogEntry() });
      }, 1600);

      // governor tick every ~3.5s (may emit null -> skipped)
      const govTimer = setInterval(() => {
        if (closed) return;
        const d = nextGovernorTick();
        if (d) send({ type: "decision", decision: d });
      }, 3500);

      // keepalive every 15s
      const kaTimer = setInterval(() => {
        if (closed) return;
        send({ type: "ping", ts: new Date().toISOString() });
      }, 15000);

      // close handler
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(logTimer);
        clearInterval(govTimer);
        clearInterval(kaTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      // no explicit cancel signal from SSE clients; the stream closes when the
      // client disconnects, which the runtime surfaces via controller error.
      void cleanup;
    },
    cancel() {
      // client disconnected
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
