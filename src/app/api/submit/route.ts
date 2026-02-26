import { NextRequest, NextResponse } from "next/server";
import { submitVisitor } from "@/lib/automation/visitor-service";
import { VisitorRequest } from "@/types/visitor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const visitor: VisitorRequest = body.visitor;

    const hasName = visitor?.firstName || visitor?.lastName;
    const hasCompany = visitor?.company;
    if (!visitor || (!hasName && !hasCompany) || !visitor.startDate) {
      return NextResponse.json(
        { error: "Invalid visitor data - need a name or company, and a date" },
        { status: 400 }
      );
    }

    // Submit the visitor via browser automation (or direct API in Phase 2)
    const result = await submitVisitor(visitor);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      method: result.method,
    });
  } catch (error) {
    console.error("Submit API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
