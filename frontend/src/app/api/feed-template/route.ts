import { NextResponse } from "next/server";

// Serves the bulk-upload template (Admin > Bulk Upload & Export) from this
// app's own origin (audit C-07 / D-05). The storage location stays on the
// server — FEED_TEMPLATE_URL, defaulting to the public S3 object that Android
// also downloads (its "tempate" spelling is the real object name) — so the
// bucket name and region no longer ship in the client bundle, and the
// browser gets a same-origin download with a proper filename.
const TEMPLATE_URL =
  process.env.FEED_TEMPLATE_URL ||
  "https://ucd-reports.s3.ap-southeast-2.amazonaws.com/feed_exports/template_upload/feeds_table_tempate.xlsx";

export async function GET() {
  try {
    const upstream = await fetch(TEMPLATE_URL, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json({ detail: "Template unavailable" }, { status: 502 });
    }
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="feeds_table_template.xlsx"',
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ detail: "Template unavailable" }, { status: 502 });
  }
}
