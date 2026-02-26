export interface VisitorRequest {
  guestType: "Temporary" | "Permanent";
  passType: string; // "Guest", "Vendor", "Delivery", etc.
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD, defaults to startDate
  daysPermitted?: number[]; // bitmask values: Mon=1,Tue=2,Wed=4,Thu=8,Fri=16,Sat=32,Sun=64
  sendEpass?: boolean;
  attendantNotes?: string;
}

export interface ParseResult {
  success: true;
  visitor: VisitorRequest;
  summary: string;
}

export interface ParseNeedsClarification {
  success: false;
  question: string;
  partialData: Partial<VisitorRequest>;
}

export type NLPResult = ParseResult | ParseNeedsClarification;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  visitorData?: VisitorRequest;
  status?: "parsing" | "executing" | "success" | "error";
}

export interface CapturedAPICall {
  timestamp: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  requestBody?: string;
  responseStatus: number;
  responseBody?: string;
}
