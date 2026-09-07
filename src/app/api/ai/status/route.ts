import { NextResponse } from "next/server";
import { aiEnabled, AI_MODEL } from "@/lib/ai/client";

/** GET /api/ai/status — whether intelligence features are configured (no secrets exposed). */
export async function GET() {
  return NextResponse.json({ enabled: aiEnabled(), model: aiEnabled() ? AI_MODEL : null });
}
