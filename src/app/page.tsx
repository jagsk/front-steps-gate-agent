"use client";

import { useState, useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { ChatMessage, VisitorRequest } from "@/types/visitor";
import { formatDate, formatDaysPermitted } from "@/lib/shared/nlp-config";
import { parseVisitorClient } from "@/lib/client/parse-visitor-client";
import { submitVisitorClient } from "@/lib/client/frontsteps-client";
import { hasCredentials } from "@/lib/client/credentials-store";
import SettingsForm from "@/components/SettingsForm";

const isNative = Capacitor.isNativePlatform();

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        'Welcome to Blackhawk Gate Agent! Type a visitor command like:\n\n"Allow David Moore, contractor for access on Feb 20th"\n\n"Add guest John Smith tomorrow"\n\n"Let Amazon delivery in on Monday"\n\n"Add Erica, cleaner every Wed starting next week"',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingVisitor, setPendingVisitor] = useState<VisitorRequest | null>(null);
  const [pendingEpass, setPendingEpass] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isLoading]);

  // Check if credentials are configured (native mode only)
  useEffect(() => {
    if (isNative) {
      hasCredentials().then((has) => setNeedsSetup(!has));
    }
  }, [showSettings]);

  const addMessage = (
    role: "user" | "assistant",
    content: string,
    extra?: Partial<ChatMessage>
  ) => {
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      role,
      content,
      timestamp: Date.now(),
      ...extra,
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    addMessage("user", text);

    // If waiting for ePass answer
    if (pendingVisitor && pendingEpass) {
      if (/^(y|yes|ok|sure|send)/i.test(text)) {
        const visitorWithEpass = { ...pendingVisitor, sendEpass: true };
        setPendingEpass(false);
        await submitVisitor(visitorWithEpass);
      } else if (/^(n|no|skip|nah)/i.test(text)) {
        const visitorNoEpass = { ...pendingVisitor, sendEpass: false };
        setPendingEpass(false);
        await submitVisitor(visitorNoEpass);
      } else {
        addMessage("assistant", "Please answer yes or no — send ePass?");
      }
      return;
    }

    // If there's a pending visitor and user says "yes"/"confirm"/"perfect"/etc.
    if (pendingVisitor && /^(y|yes|yeah|yep|yup|confirm|ok|okay|go|submit|do it|sure|perfect|great|good|fine|correct|right|approved?|looks? good|sounds? good|that'?s? (right|correct|good|perfect))/i.test(text)) {
      const hasContact = pendingVisitor.email || pendingVisitor.phone;
      if (hasContact) {
        const contact = [pendingVisitor.email, pendingVisitor.phone].filter(Boolean).join(" / ");
        setPendingEpass(true);
        addMessage("assistant", `Send ePass to **${contact}**? (yes/no)`);
        return;
      }
      await submitVisitor(pendingVisitor);
      return;
    }

    // If user says "no"/"cancel" to a pending visitor
    if (pendingVisitor && /^(n|no|cancel|nevermind)/i.test(text)) {
      setPendingVisitor(null);
      setPendingEpass(false);
      addMessage("assistant", "Cancelled. What would you like to do instead?");
      return;
    }

    // Clear pending visitor for new request
    setPendingVisitor(null);
    setPendingEpass(false);

    setIsLoading(true);
    try {
      let parsedResult: {
        type: string;
        question?: string;
        visitor?: VisitorRequest;
        error?: string;
      };

      if (isNative) {
        // Client-side: call Claude API directly from device
        const result = await parseVisitorClient(text, conversationHistory);
        if (result.success) {
          parsedResult = { type: "parsed", visitor: result.visitor };
        } else {
          parsedResult = { type: "clarification", question: result.question };
        }
      } else {
        // Server-side: use API route
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, conversationHistory }),
        });
        parsedResult = await response.json();
      }

      if (parsedResult.error) {
        addMessage("assistant", `Error: ${parsedResult.error}`, { status: "error" });
        return;
      }

      if (parsedResult.type === "clarification") {
        addMessage("assistant", parsedResult.question || "Could you provide more details?");
        setConversationHistory((prev) => [
          ...prev,
          { role: "user", content: text },
          { role: "assistant", content: parsedResult.question || "" },
        ]);
        return;
      }

      if (parsedResult.type === "parsed" && parsedResult.visitor) {
        const visitor = parsedResult.visitor;
        setPendingVisitor(visitor);

        const hasName = visitor.firstName || visitor.lastName;
        const displayName = hasName
          ? [visitor.firstName, visitor.lastName].filter(Boolean).join(" ")
          : visitor.company || "Unknown";

        // Save context so follow-up modifications ("change date to...", etc.) work
        setConversationHistory([
          { role: "user", content: text },
          {
            role: "assistant",
            content:
              `Parsed visitor: ${displayName}, ${visitor.passType}, ${visitor.guestType}, date: ${visitor.startDate}` +
              (visitor.endDate && visitor.endDate !== visitor.startDate ? ` to ${visitor.endDate}` : "") +
              (visitor.company && hasName ? `, company: ${visitor.company}` : "") +
              (visitor.daysPermitted ? `, days: ${formatDaysPermitted(visitor.daysPermitted)}` : ""),
          },
        ]);

        const isPermanent = visitor.guestType === "Permanent";
        const confirmMsg =
          `I'll create this visitor pass:\n\n` +
          `**${displayName}**\n` +
          `Type: ${visitor.passType}` +
          (hasName && visitor.company ? ` (${visitor.company})` : "") +
          `\n` +
          `Access: ${visitor.guestType}` +
          (visitor.daysPermitted && visitor.daysPermitted.length > 0
            ? ` - ${formatDaysPermitted(visitor.daysPermitted)}`
            : "") +
          (isPermanent
            ? ""
            : `\nDate: ${formatDate(visitor.startDate)}` +
              (visitor.endDate && visitor.endDate !== visitor.startDate
                ? ` to ${formatDate(visitor.endDate)}`
                : "")) +
          (visitor.email ? `\nEmail: ${visitor.email}` : "") +
          (visitor.phone ? `\nPhone: ${visitor.phone}` : "") +
          (visitor.attendantNotes ? `\nNotes: ${visitor.attendantNotes}` : "") +
          `\n\nConfirm? (yes/no)`;

        addMessage("assistant", confirmMsg, { visitorData: visitor });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Something went wrong";
      addMessage("assistant", `Error: ${msg}`, { status: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const submitVisitor = async (visitor: VisitorRequest) => {
    setIsLoading(true);
    setPendingVisitor(null);

    addMessage("assistant", "Creating visitor pass...", { status: "executing" });

    try {
      let result: { success: boolean; message?: string; error?: string };

      if (isNative) {
        // Client-side: call FrontSteps API directly from device
        result = await submitVisitorClient(visitor);
      } else {
        // Server-side: use API route
        const response = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitor }),
        });
        result = await response.json();
      }

      if (result.success) {
        const name = visitor.firstName || visitor.lastName
          ? [visitor.firstName, visitor.lastName].filter(Boolean).join(" ")
          : visitor.company || "visitor";
        const isPerm = visitor.guestType === "Permanent";
        const dateInfo = isPerm
          ? (visitor.daysPermitted ? formatDaysPermitted(visitor.daysPermitted) : "Permanent")
          : formatDate(visitor.startDate);
        addMessage(
          "assistant",
          `Pass created for **${name}** (${visitor.passType}) - ${dateInfo}`,
          { status: "success" }
        );
      } else {
        addMessage("assistant", `Failed: ${result.message || result.error}`, {
          status: "error",
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Something went wrong";
      addMessage("assistant", `Error: ${msg}`, { status: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (showSettings) {
    return <SettingsForm onBack={() => setShowSettings(false)} />;
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Blackhawk Gate Agent
            </h1>
            <p className="text-sm text-gray-500">
              Manage visitors with natural language
            </p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="text-gray-400 hover:text-gray-600 transition-colors p-3"
            aria-label="Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Setup banner for native mode */}
      {needsSetup && (
        <button
          onClick={() => setShowSettings(true)}
          className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors block w-full text-left"
        >
          Set up your credentials in Settings to get started.
        </button>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : msg.status === "success"
                    ? "bg-green-50 border border-green-200 text-green-900"
                    : msg.status === "error"
                      ? "bg-red-50 border border-red-200 text-red-900"
                      : msg.status === "executing"
                        ? "bg-yellow-50 border border-yellow-200 text-yellow-900"
                        : "bg-white border border-gray-200 text-gray-900"
              }`}
            >
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {renderContent(msg.content)}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='e.g. "Allow David Moore, contractor on Feb 20th"'
            disabled={isLoading}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 text-white rounded-xl px-5 py-3 text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function renderContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
