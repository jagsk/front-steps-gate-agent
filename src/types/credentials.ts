export interface UserCredentials {
  nlpProvider: "gemini" | "anthropic";
  geminiApiKey?: string;
  anthropicApiKey?: string;
  frontstepsEmail: string;
  frontstepsPassword: string;
  homeId?: string;
  userId?: string;
}
