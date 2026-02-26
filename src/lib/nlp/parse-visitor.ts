import Anthropic from "@anthropic-ai/sdk";
import { NLPResult } from "@/types/visitor";
import { buildSystemPrompt, TOOL_DEFINITIONS, parseToolResponse } from "@/lib/shared/nlp-config";

const client = new Anthropic();

export async function parseVisitorRequest(
  userMessage: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[] = []
): Promise<NLPResult> {
  const systemPrompt = buildSystemPrompt();

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    tools: TOOL_DEFINITIONS,
    messages,
  });

  return parseToolResponse(response.content);
}
