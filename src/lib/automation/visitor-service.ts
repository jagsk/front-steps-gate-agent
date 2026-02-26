import { VisitorRequest } from "@/types/visitor";
import { createVisitorViaAPI, SessionTokens } from "@/lib/api-client/frontsteps-api";
import { createVisitor, getSessionTokens } from "./browser";

export interface VisitorResult {
  success: boolean;
  message: string;
  method: "browser" | "api";
}

let cachedTokens: SessionTokens | null = null;

/**
 * Orchestrator: tries direct API first, falls back to Playwright browser automation.
 */
export async function submitVisitor(visitor: VisitorRequest): Promise<VisitorResult> {
  // Try direct API first
  try {
    // Get tokens (use cached if available)
    if (!cachedTokens) {
      console.log("Fetching session tokens for direct API...");
      cachedTokens = await getSessionTokens();
    }

    console.log("Attempting direct API submission...");
    const apiResult = await createVisitorViaAPI(visitor, cachedTokens);

    if (apiResult.success) {
      console.log(`Direct API succeeded (guest_id: ${apiResult.guestId})`);
      return { success: true, message: apiResult.message, method: "api" };
    }

    // Auth error — clear cached tokens and retry once with fresh tokens
    if (apiResult.message.includes("Auth error") || apiResult.message.includes("session may be expired")) {
      console.log("Direct API auth failed, refreshing tokens and retrying...");
      cachedTokens = await getSessionTokens();
      const retryResult = await createVisitorViaAPI(visitor, cachedTokens);

      if (retryResult.success) {
        console.log(`Direct API retry succeeded (guest_id: ${retryResult.guestId})`);
        return { success: true, message: retryResult.message, method: "api" };
      }

      console.log("Direct API retry also failed:", retryResult.message);
    } else {
      console.log("Direct API failed (non-auth):", apiResult.message);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log("Direct API error:", msg);
    // Clear cached tokens on any error
    cachedTokens = null;
  }

  // Fallback to Playwright browser automation
  console.log("Falling back to Playwright browser automation...");
  const result = await createVisitor(visitor);
  return {
    ...result,
    method: "browser",
  };
}
