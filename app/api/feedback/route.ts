import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";
import { SendByte } from "@sendbyte/node";

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, content, project_id, metadata } = body;

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("feedback")
      .insert({
        user_id: session.user.id,
        type: type || 'general',
        content,
        project_id: project_id || null,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving feedback:", error);
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    // Send email notification
    const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY;
    if (SENDBYTE_API_KEY) {
      try {
        const sendbyte = new SendByte(SENDBYTE_API_KEY);
        await sendbyte.emails.send({
          from: "Cencori Feedback <feedback@send.cencori.com>",
          to: "bola@cencori.com",
          subject: `[Feedback] ${type === "positive" ? "👍" : type === "negative" ? "👎" : "💬"} from ${session.user.email}`,
          html: `<p><strong>Type:</strong> ${type || "general"}</p><p><strong>From:</strong> ${session.user.email}</p><p><strong>Message:</strong></p><p>${content}</p>`,
        });
      } catch (emailErr) {
        console.error("Failed to send feedback email:", emailErr);
      }
    }

    return NextResponse.json({ success: true, feedback: data });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
