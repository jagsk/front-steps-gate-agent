import { NLPResult } from "@/types/visitor";
import { buildSystemPrompt, TOOL_DEFINITIONS, parseToolResponse } from "@/lib/shared/nlp-config";
import { getCredentials } from "./credentials-store";
import { parseVisitorGemini } from "./parse-visitor-gemini";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Client-side NLP parser — routes to Gemini (default) or Anthropic
 * based on user's provider setting.
 */
export async function parseVisitorClient(
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[] = []
): Promise<NLPResult> {
  console.log("[GateAgent] parseVisitorClient called");

  let credentials;
  try {
    credentials = await getCredentials();
    console.log("[GateAgent] credentials loaded:", credentials ? "yes" : "no");
  } catch (e) {
    console.error("[GateAgent] getCredentials error:", e);
    return {
      success: false,
      question: "Error loading credentials. Go to Settings and save them again.",
      partialData: {},
    };
  }

  const provider = credentials?.nlpProvider || "gemini";
  console.log("[GateAgent] NLP provider:", provider);

  if (provider === "gemini") {
    return parseVisitorGemini(userMessage, conversationHistory);
  }

  return parseVisitorAnthropic(userMessage, conversationHistory, credentials?.anthropicApiKey);
}

/**
 * Anthropic/Claude NLP parser — calls Claude API directly from the device.
 */
async function parseVisitorAnthropic(
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  apiKey: string | undefined
): Promise<NLPResult> {
  if (!apiKey) {
    return {
      success: false,
      question: "Please configure your Anthropic API key in Settings first.",
      partialData: {},
    };
  }

  const systemPrompt = buildSystemPrompt();

  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  console.log("[GateAgent] calling Anthropic API...");

  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS,
        messages,
      }),
    });
    console.log("[GateAgent] Anthropic API response status:", response.status);
  } catch (fetchError) {
    console.error("[GateAgent] fetch error:", fetchError);
    return {
      success: false,
      question: `Network error calling Claude API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
      partialData: {},
    };
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[GateAgent] API error:", response.status, errorText);
    return {
      success: false,
      question: `API error (${response.status}): ${errorText || "Failed to reach Claude API"}`,
      partialData: {},
    };
  }

  const data = await response.json();
  console.log("[GateAgent] Anthropic response received, parsing...");
  return parseToolResponse(data.content);
}
