import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
