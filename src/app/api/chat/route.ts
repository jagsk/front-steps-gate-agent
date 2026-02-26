import { NextRequest, NextResponse } from "next/server";
import { parseVisitorRequest } from "@/lib/nlp/parse-visitor";
import { submitVisitor } from "@/lib/automation/visitor-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory = [] } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Step 1: Parse the natural language input
    const parseResult = await parseVisitorRequest(message, conversationHistory);

    if (!parseResult.success) {
      return NextResponse.json({
        type: "clarification",
        question: parseResult.question,
        partialData: parseResult.partialData,
      });
    }

    // Step 2: Return parsed data for user confirmation
    return NextResponse.json({
      type: "parsed",
      visitor: parseResult.visitor,
      summary: parseResult.summary,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
