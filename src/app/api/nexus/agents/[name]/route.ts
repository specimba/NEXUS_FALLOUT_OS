/**
 * GET /api/nexus/agents/[name] — single agent + recent governor decisions
 * + recent vault entries. Next 16: `params` is a Promise and must be awaited.
 */
import { NextResponse } from "next/server";
import { getAgent, nexusDelay } from "@/lib/nexus/brain";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await nexusDelay();
    const { name } = await params;
    const decoded = decodeURIComponent(name);
    const agent = getAgent(decoded);
    if (!agent) {
      return NextResponse.json(
        { error: "agent not found", name: decoded },
        { status: 404 },
      );
    }
    return NextResponse.json(agent);
  } catch (e) {
    return NextResponse.json(
      { error: "nexus brain fault", detail: String(e) },
      { status: 500 },
    );
  }
}
