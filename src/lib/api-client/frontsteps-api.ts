import { VisitorRequest } from "@/types/visitor";
import { DEFAULT_BASE_URL, DEFAULT_HOME_ID, DEFAULT_USER_ID, buildVisitorBody } from "@/lib/shared/frontsteps-config";

const BASE_URL = process.env.FRONTSTEPS_BASE_URL || DEFAULT_BASE_URL;
const DL_HOME_ID = process.env.FRONTSTEPS_HOME_ID || DEFAULT_HOME_ID;
const DL_USER_ID = process.env.FRONTSTEPS_USER_ID || DEFAULT_USER_ID;

export interface SessionTokens {
  cookies: string;
  csrfToken: string;
}

/**
 * Create a visitor pass via the FrontSteps REST API directly.
 */
export async function createVisitorViaAPI(
  visitor: VisitorRequest,
  tokens: SessionTokens
): Promise<{ success: boolean; message: string; guestId?: string }> {
  const body = buildVisitorBody(visitor, DL_HOME_ID, DL_USER_ID);

  console.log("Direct API: Creating visitor...", JSON.stringify(body, null, 2));

  const response = await fetch(`${BASE_URL}/dwelling_live/guests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json, text/plain, */*",
      Cookie: tokens.cookies,
      "X-CSRF-Token": tokens.csrfToken,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });

  console.log("Direct API: Response status:", response.status);

  if (response.status === 401 || response.status === 403 || response.status === 422) {
    return {
      success: false,
      message: `Auth error (${response.status}) - session may be expired`,
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      success: false,
      message: `API error ${response.status}: ${text}`,
    };
  }

  const data = await response.json().catch(() => ({}));
  console.log("Direct API: Response body:", JSON.stringify(data));

  const displayName =
    visitor.firstName || visitor.lastName
      ? [visitor.firstName, visitor.lastName].filter(Boolean).join(" ")
      : visitor.company || "visitor";

  return {
    success: true,
    message: `Visitor pass created for ${displayName}`,
    guestId: data.guest_id,
  };
}
