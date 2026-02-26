import { VisitorRequest } from "@/types/visitor";

export const SYSTEM_PROMPT_TEMPLATE = `You are a visitor management assistant. Parse natural language requests into structured visitor data for a gated community access system.

Today's date is: {{TODAY}}

Extract the following fields from the user's message:
- firstName: Guest's first name (optional if company is provided)
- lastName: Guest's last name (optional if company is provided)
- guestType: "Temporary" (default) or "Permanent"
- passType: "Guest" (default), "Vendor", "Delivery", or other type mentioned
- company: Company or business name if mentioned
- email: Email if mentioned
- phone: Phone number if mentioned
- startDate: Access start date in YYYY-MM-DD format. ALWAYS assume the current year if no year is specified (e.g. "March 15th" means March 15th of this year). For day names, look up the date in the reference calendar below — do NOT calculate dates yourself. If "today", use today's date. If "tomorrow", use tomorrow's date. For day names like "Monday", "Wednesday", "coming Friday", find that day in the reference calendar and use the exact YYYY-MM-DD shown. For permanent guests with specific days (e.g. "every Wed starting next week"), set startDate to the next occurrence of that specific day from the calendar. If no start date is mentioned for a permanent guest, use today's date. Never ask for clarification about the year.
- endDate: Access end date in YYYY-MM-DD format. Defaults to startDate if not mentioned.
- attendantNotes: Any additional notes or context

IMPORTANT rules for passType:
- Words like "contractor", "plumber", "electrician", "handyman", "repair", "worker", "service" → passType: "Vendor"
- Words like "cleaner", "housekeeper", "gardener", "nanny", "caretaker", "maid" → passType: "Vendor"
- Business/company names (e.g. "Lyft", "Uber", "ABC Plumbing") → passType: "Vendor"
- Words like "delivery", "package" → passType: "Delivery"
- Well-known delivery services (Amazon, FedEx, UPS, DHL) → passType: "Delivery", set company to that name
- Words like "guest", "friend", "family", "visitor" or no specific type → passType: "Guest"

IMPORTANT rules for guestType and daysPermitted:
- Default guestType is "Temporary" (one-time or bounded visit with a start/end date)
- "Permanent" means RECURRING access on specific days of the week with NO end date (ongoing/forever)
- ONLY set guestType to "Permanent" when the user explicitly says "every [day]" implying ongoing recurring access with no end date
- If the request has a bounded time period (e.g. "next week", "this week", "March 1-5", "all of next week", "Monday through Friday next week"), it is ALWAYS "Temporary" — set startDate and endDate to cover the range. Do NOT set daysPermitted.
- When guestType is "Permanent", you MUST set daysPermitted as an array of day NAME strings:
  Valid values: "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
- Permanent examples (ongoing, no end date):
  - "every Wednesday" → guestType: "Permanent", daysPermitted: ["Wednesday"]
  - "every Mon, Wed, Fri" → guestType: "Permanent", daysPermitted: ["Monday", "Wednesday", "Friday"]
  - "cleaner every weekday" → guestType: "Permanent", daysPermitted: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  - "nanny every day" → guestType: "Permanent", daysPermitted: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
- Temporary examples (bounded, has start/end date):
  - "next week" → Temporary, startDate: Monday, endDate: Friday (or Sunday)
  - "all of next week" → Temporary, startDate: Monday, endDate: Sunday
  - "Monday through Friday next week" → Temporary, startDate: Monday, endDate: Friday
  - "on Friday" → Temporary, single day
  - "March 1 to March 5" → Temporary, startDate/endDate set
- If guestType is "Temporary", do NOT set daysPermitted.

IMPORTANT rules for names:
- Either (firstName + lastName) OR company is required, not both.
- If only a company/business name is given (e.g. "Allow Lyft tomorrow"), set company and leave firstName/lastName empty.
- If a person's name AND a company are given (e.g. "John Smith from ABC Plumbing"), set all three.
- If only a single word name is given that could be a company (e.g. "Uber"), treat it as a company name.
- If you cannot determine either a name or a company, ask for clarification.`;

export const TOOL_DEFINITIONS = [
  {
    name: "create_visitor_pass",
    description:
      "Create a visitor pass with the extracted information. Call this when you have enough information to create the pass.",
    input_schema: {
      type: "object" as const,
      properties: {
        firstName: {
          type: "string",
          description: "Guest's first name",
        },
        lastName: {
          type: "string",
          description: "Guest's last name",
        },
        guestType: {
          type: "string",
          enum: ["Temporary", "Permanent"],
          description: "Type of guest access",
        },
        passType: {
          type: "string",
          description:
            'Type of pass: "Guest", "Vendor", "Delivery", etc.',
        },
        company: {
          type: "string",
          description: "Company name if applicable",
        },
        email: {
          type: "string",
          description: "Email address if provided",
        },
        phone: {
          type: "string",
          description: "Phone number if provided",
        },
        startDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format",
        },
        endDate: {
          type: "string",
          description:
            "End date in YYYY-MM-DD format. Same as startDate if single day.",
        },
        daysPermitted: {
          type: "array",
          items: {
            type: "string",
            enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          },
          description:
            "Array of day names for permitted days. Only set for Permanent guests with recurring day patterns.",
        },
        attendantNotes: {
          type: "string",
          description: "Additional notes",
        },
      },
      required: [
        "guestType",
        "passType",
        "startDate",
      ],
    },
  },
  {
    name: "ask_clarification",
    description:
      "Ask the user for missing or ambiguous information before creating the visitor pass.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user",
        },
        partialFirstName: { type: "string" },
        partialLastName: { type: "string" },
        partialPassType: { type: "string" },
        partialStartDate: { type: "string" },
      },
      required: ["question"],
    },
  },
];

// FrontSteps uses Sunday-first bitmask: Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64
export const DAY_NAME_TO_BITMASK: Record<string, number> = {
  sunday: 1, monday: 2, tuesday: 4, wednesday: 8, thursday: 16,
  friday: 32, saturday: 64,
};

export const BITMASK_TO_DAY_NAME: Record<number, string> = {
  1: "Sun", 2: "Mon", 4: "Tue", 8: "Wed", 16: "Thu", 32: "Fri", 64: "Sat",
};

export const ALL_DAY_BITMASKS = [1, 2, 4, 8, 16, 32, 64];

export function dayNamesToBitmask(dayNames: string[]): number[] | undefined {
  const values = dayNames
    .map(name => DAY_NAME_TO_BITMASK[name.toLowerCase()])
    .filter((v): v is number => v !== undefined);
  return values.length > 0 ? values : undefined;
}

export function formatDaysPermitted(days: number[]): string {
  const sorted = ALL_DAY_BITMASKS.filter(d => days.includes(d));
  if (sorted.length === 7) return "Every day";
  if (sorted.length === 5 && !days.includes(1) && !days.includes(64)) return "Weekdays";
  if (sorted.length === 2 && days.includes(1) && days.includes(64)) return "Weekends";
  return "Every " + sorted.map(d => BITMASK_TO_DAY_NAME[d]).join(", ");
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatSummary(visitor: VisitorRequest): string {
  const hasName = visitor.firstName || visitor.lastName;
  const namePart = hasName
    ? [visitor.firstName, visitor.lastName].filter(Boolean).join(" ")
    : visitor.company || "Unknown";

  const parts = [
    namePart,
    visitor.passType !== "Guest" ? `(${visitor.passType})` : "(Guest)",
    visitor.guestType === "Permanent" ? "[Permanent]" : "",
    hasName && visitor.company ? `from ${visitor.company}` : "",
    `- ${formatDate(visitor.startDate)}`,
    visitor.endDate && visitor.endDate !== visitor.startDate
      ? `to ${formatDate(visitor.endDate)}`
      : "",
    visitor.daysPermitted ? formatDaysPermitted(visitor.daysPermitted) : "",
  ];
  return parts.filter(Boolean).join(" ");
}

/** Format a Date as YYYY-MM-DD using LOCAL time (not UTC). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build the system prompt with today's date and a reference calendar.
 */
export function buildSystemPrompt(): string {
  const now = new Date();
  const today = toLocalDateStr(now);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDay = dayNames[now.getDay()];

  // Build a 14-day calendar so the LLM can look up dates accurately
  const calendar: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    calendar.push(`  ${dayNames[d.getDay()]} ${toLocalDateStr(d)}${label}`);
  }

  const dateContext = `${today} (${todayDay})\n\nReference calendar — use this to map day names to dates:\n${calendar.join("\n")}`;
  return SYSTEM_PROMPT_TEMPLATE.replace("{{TODAY}}", dateContext);
}

/**
 * Parse a Claude API tool_use response into NLP result data.
 * Works with both server-side SDK responses and raw API response blocks.
 */
export function parseToolResponse(
  contentBlocks: Array<{ type: string; name?: string; input?: unknown; text?: string }>
) {
  for (const block of contentBlocks) {
    if (block.type === "tool_use") {
      if (block.name === "create_visitor_pass") {
        const input = block.input as Record<string, unknown>;
        const visitor: VisitorRequest = {
          firstName: (input.firstName as string) || undefined,
          lastName: (input.lastName as string) || undefined,
          guestType: ((input.guestType as string) as "Temporary" | "Permanent") || "Temporary",
          passType: (input.passType as string) || "Guest",
          company: (input.company as string) || undefined,
          email: (input.email as string) || undefined,
          phone: (input.phone as string) || undefined,
          startDate: input.startDate as string,
          endDate: (input.endDate as string) || (input.startDate as string),
          daysPermitted: Array.isArray(input.daysPermitted)
            ? dayNamesToBitmask(input.daysPermitted as string[])
            : undefined,
          attendantNotes: (input.attendantNotes as string) || undefined,
        };

        const summary = formatSummary(visitor);
        return { success: true as const, visitor, summary };
      }

      if (block.name === "ask_clarification") {
        const input = block.input as Record<string, string>;
        return {
          success: false as const,
          question: input.question,
          partialData: {
            firstName: input.partialFirstName,
            lastName: input.partialLastName,
            passType: input.partialPassType,
            startDate: input.partialStartDate,
          },
        };
      }
    }
  }

  // Fallback: extract text response
  const textBlock = contentBlocks.find((b) => b.type === "text");
  if (textBlock && "text" in textBlock && textBlock.text) {
    return {
      success: false as const,
      question: textBlock.text,
      partialData: {},
    };
  }

  return {
    success: false as const,
    question: "I couldn't understand that. Could you provide the visitor's full name and when they need access?",
    partialData: {},
  };
}

/**
 * Gemini function declarations — same schema as TOOL_DEFINITIONS but in Gemini format.
 * Differences: `input_schema` → `parameters`, wrapped in `functionDeclarations`.
 */
export const GEMINI_TOOL_DEFINITIONS = [
  {
    functionDeclarations: TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.input_schema.type,
        properties: tool.input_schema.properties,
        required: tool.input_schema.required,
      },
    })),
  },
];

/**
 * Parse a Gemini generateContent response into NLP result data.
 * Gemini returns functionCall in candidates[0].content.parts[].
 */
export function parseGeminiToolResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candidates: Array<{ content: { parts: Array<{ functionCall?: { name: string; args: Record<string, unknown> }; text?: string }> } }>
) {
  if (!candidates || candidates.length === 0) {
    return {
      success: false as const,
      question: "No response from Gemini. Please try again.",
      partialData: {},
    };
  }

  const parts = candidates[0].content.parts;

  for (const part of parts) {
    if (part.functionCall) {
      const { name, args } = part.functionCall;

      if (name === "create_visitor_pass") {
        const visitor: VisitorRequest = {
          firstName: (args.firstName as string) || undefined,
          lastName: (args.lastName as string) || undefined,
          guestType: ((args.guestType as string) as "Temporary" | "Permanent") || "Temporary",
          passType: (args.passType as string) || "Guest",
          company: (args.company as string) || undefined,
          email: (args.email as string) || undefined,
          phone: (args.phone as string) || undefined,
          startDate: args.startDate as string,
          endDate: (args.endDate as string) || (args.startDate as string),
          daysPermitted: Array.isArray(args.daysPermitted)
            ? dayNamesToBitmask(args.daysPermitted as string[])
            : undefined,
          attendantNotes: (args.attendantNotes as string) || undefined,
        };

        const summary = formatSummary(visitor);
        return { success: true as const, visitor, summary };
      }

      if (name === "ask_clarification") {
        return {
          success: false as const,
          question: (args.question as string) || "Could you provide more details?",
          partialData: {
            firstName: args.partialFirstName as string | undefined,
            lastName: args.partialLastName as string | undefined,
            passType: args.partialPassType as string | undefined,
            startDate: args.partialStartDate as string | undefined,
          },
        };
      }
    }
  }

  // Fallback: extract text response
  const textPart = parts.find((p) => p.text);
  if (textPart?.text) {
    return {
      success: false as const,
      question: textPart.text,
      partialData: {},
    };
  }

  return {
    success: false as const,
    question: "I couldn't understand that. Could you provide the visitor's full name and when they need access?",
    partialData: {},
  };
}
