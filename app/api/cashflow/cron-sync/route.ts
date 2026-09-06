import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGoogleSheetSync } from "@/lib/cashflow/syncService";

/**
 * Unattended sync endpoint for an external scheduler (Vercel Cron, OS
 * crontab + curl, GitHub Actions, etc). Protected by a shared secret —
 * never by session cookies, since there is no logged-in user here. Set
 * CRON_SECRET in the environment and call:
 *   curl -X POST https://cf.amorgroup.id/api/cashflow/cron-sync \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on the server" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  try {
    const result = await runGoogleSheetSync(supabase, { triggeredBy: null, triggerType: "cron" });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
