import { UserCredentials } from "@/types/credentials";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const STORAGE_KEY = "gateAgentCredentials";

/**
 * Client-side credential storage.
 * Uses Capacitor Preferences on native, localStorage on web.
 */

const isNative = Capacitor.isNativePlatform();

async function storeGet(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

async function storeSet(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

async function storeRemove(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key });
  } else {
    localStorage.removeItem(key);
  }
}

export async function getCredentials(): Promise<UserCredentials | null> {
  const value = await storeGet(STORAGE_KEY);
  if (!value) return null;
  try {
    const creds = JSON.parse(value) as UserCredentials;
    // Backward compatibility: old credentials without nlpProvider
    if (!creds.nlpProvider) {
      creds.nlpProvider = creds.anthropicApiKey ? "anthropic" : "gemini";
    }
    return creds;
  } catch {
    return null;
  }
}

export async function saveCredentials(credentials: UserCredentials): Promise<void> {
  await storeSet(STORAGE_KEY, JSON.stringify(credentials));
}

export async function clearCredentials(): Promise<void> {
  await storeRemove(STORAGE_KEY);
}

export async function hasCredentials(): Promise<boolean> {
  const creds = await getCredentials();
  if (!creds?.frontstepsEmail || !creds?.frontstepsPassword) return false;
  const provider = creds.nlpProvider || "gemini";
  if (provider === "gemini") return !!creds.geminiApiKey;
  return !!creds.anthropicApiKey;
}
