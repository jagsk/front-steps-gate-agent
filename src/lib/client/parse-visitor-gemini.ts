import { NLPResult } from "@/types/visitor";
import { buildSystemPrompt, GEMINI_TOOL_DEFINITIONS, parseGeminiToolResponse } from "@/lib/shared/nlp-config";
import { getCredentials } from "./credentials-store";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Client-side NLP parser — calls Gemini API directly from the device.
 * No server needed. Uses the free tier of Gemini 2.5 Flash.
 */
export async function parseVisitorGemini(
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[] = []
): Promise<NLPResult> {
  console.log("[GateAgent] parseVisitorGemini called");

  let credentials;
  try {
    credentials = await getCredentials();
  } catch (e) {
    console.error("[GateAgent] getCredentials error:", e);
    return {
      success: false,
      question: "Error loading credentials. Go to Settings and save them again.",
      partialData: {},
    };
  }

  if (!credentials?.geminiApiKey) {
    return {
      success: false,
      question: "Please configure your Gemini API key in Settings first. Get a free key at aistudio.google.com",
      partialData: {},
    };
  }

  const systemPrompt = buildSystemPrompt();

  // Gemini uses "model" role instead of "assistant"
  const contents = [
    ...conversationHistory.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  console.log("[GateAgent] calling Gemini API...");

  let response;
  try {
    response = await fetch(`${GEMINI_API_URL}?key=${credentials.geminiApiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        tools: GEMINI_TOOL_DEFINITIONS,
      }),
    });
    console.log("[GateAgent] Gemini API response status:", response.status);
  } catch (fetchError) {
    console.error("[GateAgent] fetch error:", fetchError);
    return {
      success: false,
      question: `Network error calling Gemini API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
      partialData: {},
    };
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[GateAgent] Gemini API error:", response.status, errorText);
    return {
      success: false,
      question: `Gemini API error (${response.status}): ${errorText || "Failed to reach Gemini API"}`,
      partialData: {},
    };
  }

  const data = await response.json();
  console.log("[GateAgent] Gemini response received, parsing...");
  return parseGeminiToolResponse(data.candidates);
}
