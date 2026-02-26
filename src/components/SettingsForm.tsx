"use client";

import { useState, useEffect } from "react";
import { UserCredentials } from "@/types/credentials";
import {
  getCredentials,
  saveCredentials,
  clearCredentials,
} from "@/lib/client/credentials-store";

interface SettingsFormProps {
  onBack: () => void;
}

export default function SettingsForm({ onBack }: SettingsFormProps) {
  const [provider, setProvider] = useState<"gemini" | "anthropic">("gemini");
  const [geminiKey, setGeminiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [homeId, setHomeId] = useState("");
  const [userId, setUserId] = useState("");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getCredentials()
      .then((creds) => {
        if (creds) {
          setProvider(creds.nlpProvider || "gemini");
          setGeminiKey(creds.geminiApiKey || "");
          setAnthropicKey(creds.anthropicApiKey || "");
          setEmail(creds.frontstepsEmail || "");
          setPassword(creds.frontstepsPassword || "");
          setHomeId(creds.homeId || "");
          setUserId(creds.userId || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const activeApiKey = provider === "gemini" ? geminiKey : anthropicKey;
  const canSave = activeApiKey.trim() && email.trim() && password;

  const handleSave = async () => {
    const credentials: UserCredentials = {
      nlpProvider: provider,
      geminiApiKey: geminiKey.trim() || undefined,
      anthropicApiKey: anthropicKey.trim() || undefined,
      frontstepsEmail: email.trim(),
      frontstepsPassword: password,
      homeId: homeId.trim() || undefined,
      userId: userId.trim() || undefined,
    };
    await saveCredentials(credentials);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = async () => {
    await clearCredentials();
    setProvider("gemini");
    setGeminiKey("");
    setAnthropicKey("");
    setEmail("");
    setPassword("");
    setHomeId("");
    setUserId("");
    setSaved(false);
  };

  if (!loaded) {
    return (
      <div className="flex flex-col h-screen max-w-2xl mx-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-gray-500 hover:text-gray-900 transition-colors p-2"
              aria-label="Back to chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="bg-white border-b border-gray-200 px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-900 transition-colors p-2"
            aria-label="Back to chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500">
              Configure your credentials
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* AI Provider Selection */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            AI Provider
          </h2>
          <div className="flex rounded-xl border border-gray-300 overflow-hidden">
            <button
              type="button"
              onClick={() => setProvider("gemini")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                provider === "gemini"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Gemini (Free)
            </button>
            <button
              type="button"
              onClick={() => setProvider("anthropic")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-l border-gray-300 ${
                provider === "anthropic"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Anthropic
            </button>
          </div>
        </div>

        {/* API Key — conditional based on provider */}
        {provider === "gemini" ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Gemini API Key
            </label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400">
              Free — get a key at{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                aistudio.google.com
              </a>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400">
              Paid — get a key at{" "}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                console.anthropic.com
              </a>
            </p>
          </div>
        )}

        <hr className="border-gray-200" />

        {/* FrontSteps Credentials */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            FrontSteps Account
          </h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your FrontSteps password"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Home ID
              </label>
              <input
                type="text"
                value={homeId}
                onChange={(e) => setHomeId(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                User ID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Home ID and User ID are optional — defaults will be used if not set.
          </p>
        </div>

        <hr className="border-gray-200" />

        {/* About */}
        <div className="text-center space-y-2 pb-4">
          <p className="text-sm font-medium text-gray-600">
            Blackhawk Gate Agent
          </p>
          <p className="text-xs text-gray-400">
            Built by a Blackhawk resident
          </p>
          <a
            href="mailto:blackhawkgateagent@gmail.com"
            className="inline-block text-xs text-blue-500 hover:text-blue-600"
          >
            blackhawkgateagent@gmail.com
          </a>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 bg-white px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0">
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 bg-blue-600 text-white rounded-xl px-5 py-3 text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saved ? "Saved!" : "Save"}
          </button>
          <button
            onClick={handleClear}
            className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
