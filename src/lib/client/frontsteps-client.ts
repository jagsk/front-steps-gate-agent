import { VisitorRequest } from "@/types/visitor";
import { DEFAULT_BASE_URL, DEFAULT_HOME_ID, DEFAULT_USER_ID, buildVisitorBody } from "@/lib/shared/frontsteps-config";
import { getCredentials } from "./credentials-store";

/**
 * Cached CSRF token (cookies are managed by the native cookie jar).
 */
let cachedCsrf: { token: string; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Login to FrontSteps via Auth0 and extract CSRF token.
 *
 * With CapacitorHttp enabled, fetch uses Android's native HTTP client.
 * The native layer manages cookies automatically (cookie jar), so we
 * do NOT manually set Cookie headers. We just make the requests in
 * sequence and the session cookies persist across requests.
 */
async function loginToFrontSteps(): Promise<string> {
  const credentials = await getCredentials();
  if (!credentials?.frontstepsEmail || !credentials?.frontstepsPassword) {
    throw new Error("FrontSteps credentials not configured. Go to Settings.");
  }

  const baseUrl = DEFAULT_BASE_URL;

  // Step 1: Navigate to sign_in to get Auth0 login page
  console.log("[GateAgent] Step 1: GET /users/sign_in");
  const signInResponse = await fetch(`${baseUrl}/users/sign_in`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  console.log("[GateAgent] Step 1 status:", signInResponse.status, "url:", signInResponse.url);

  const authPageHtml = await signInResponse.text();
  console.log("[GateAgent] Step 1 HTML length:", authPageHtml.length);

  // Check if we're already logged in (cookie jar has valid session).
  // If the page is NOT an Auth0 login page, we can skip straight to CSRF extraction.
  const isAuth0Page = authPageHtml.includes("auth0") || authPageHtml.includes("atob(") || signInResponse.url.includes("auth.frontsteps.com");
  const alreadyLoggedIn = !isAuth0Page && authPageHtml.includes("csrf-token");

  if (alreadyLoggedIn) {
    // Already logged in — extract CSRF directly from this page or the VM page
    console.log("[GateAgent] Already logged in (session cookies valid), skipping Auth0 flow");
  } else {
    // Need to do full Auth0 login
    // Step 2: Extract Auth0 config from the Universal Login page
    // Auth0 Classic UL embeds config as base64:
    //   JSON.parse(decodeURIComponent(escape(window.atob('base64...'))))
    let auth0Config: Record<string, unknown> | null = null;

    const atobMatch = authPageHtml.match(/atob\('([A-Za-z0-9+\/=]+)'\)/);
    if (atobMatch) {
      try {
        const decoded = atob(atobMatch[1]);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
        const text = new TextDecoder().decode(bytes);
        auth0Config = JSON.parse(text);
        console.log("[GateAgent] Step 2: Auth0 config extracted, keys:", Object.keys(auth0Config!));
      } catch (e) {
        console.error("[GateAgent] Step 2: Failed to parse atob config:", e);
      }
    } else {
      console.log("[GateAgent] Step 2: No atob pattern found in HTML");
    }

    // Extract fields from config or use fallbacks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = auth0Config as Record<string, any> | null;
    let clientId = cfg?.clientID || cfg?.client_id || "";
    let auth0State = cfg?.extraParams?.state || cfg?.state || "";
    let connection = cfg?.connection || "";
    let tenant = cfg?.auth0Tenant || cfg?.tenant || "";
    let redirectUri = cfg?.callbackURL || cfg?.redirect_uri || "";
    const responseType = cfg?.extraParams?.response_type || "code";
    const scope = cfg?.extraParams?.scope || "openid profile email";

    // Fallback: extract params from the final redirect URL
    if (!clientId || !auth0State) {
      try {
        const urlObj = new URL(signInResponse.url);
        if (!clientId) clientId = urlObj.searchParams.get("client_id") || "";
        if (!auth0State) auth0State = urlObj.searchParams.get("state") || "";
        if (!connection) connection = urlObj.searchParams.get("connection") || "";
        if (!redirectUri) redirectUri = urlObj.searchParams.get("redirect_uri") || "";
      } catch { /* ignore */ }
    }

    // Fallback: regex patterns in HTML for individual fields
    if (!clientId) {
      const m = authPageHtml.match(/["']client(?:ID|_id)["']\s*[:=]\s*["']([^"']+)["']/);
      clientId = m?.[1] || "";
    }
    if (!auth0State) {
      const m = authPageHtml.match(/["']state["']\s*[:=]\s*["']([a-f0-9]{20,})["']/);
      auth0State = m?.[1] || "";
    }

    console.log("[GateAgent] Step 2 result:", {
      clientId: clientId ? clientId.substring(0, 8) + "..." : "MISSING",
      state: auth0State ? auth0State.substring(0, 12) + "..." : "MISSING",
      connection: connection || "MISSING",
      tenant: tenant || "MISSING",
    });

    if (!clientId) {
      console.error("[GateAgent] Cannot extract client_id. HTML first 800 chars:", authPageHtml.substring(0, 800));
      throw new Error("Could not extract Auth0 client_id from login page");
    }

    // Step 3: POST credentials to Auth0 (JSON format)
    const loginUrl = "https://auth.frontsteps.com/usernamepassword/login";
    console.log("[GateAgent] Step 3: POST credentials to", loginUrl);

    const loginResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        "Auth0-Client": btoa(JSON.stringify({ name: "lock.js", version: "11.35.1" })),
      },
      body: JSON.stringify({
        client_id: clientId,
        username: credentials.frontstepsEmail,
        password: credentials.frontstepsPassword,
        connection: connection || "company-users-and-users",
        state: auth0State,
        tenant: tenant || "frontsteps",
        redirect_uri: redirectUri || `${baseUrl}/auth/auth0/callback`,
        response_type: responseType,
        scope: scope,
      }),
      redirect: "follow",
    });
    console.log("[GateAgent] Step 3 status:", loginResponse.status, "url:", loginResponse.url);

    const loginHtml = await loginResponse.text();
    console.log("[GateAgent] Step 3 response length:", loginHtml.length);

    if (loginResponse.status !== 200) {
      console.error("[GateAgent] Step 3 error body:", loginHtml.substring(0, 500));
      throw new Error(`Auth0 login failed (${loginResponse.status})`);
    }

    // Check for callback form (Auth0 returns a hidden form with wresult/wctx)
    const callbackFormMatch = loginHtml.match(/action="(https?:\/\/[^"]+)"/);
    const hiddenInputs = [...loginHtml.matchAll(/<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/g)];

    if (callbackFormMatch && hiddenInputs.length > 0) {
      const callbackUrl = callbackFormMatch[1];
      console.log("[GateAgent] Step 4: POST callback to:", callbackUrl, "inputs:", hiddenInputs.length);

      // Decode HTML entities in form values (e.g. &#34; → " in wctx JSON)
      const decodeHtml = (s: string) =>
        s.replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

      const formData = new URLSearchParams();
      for (const [, name, value] of hiddenInputs) {
        formData.append(name, decodeHtml(value));
      }

      const callbackResponse = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
        },
        body: formData.toString(),
        redirect: "follow",
      });
      console.log("[GateAgent] Step 4 status:", callbackResponse.status, "url:", callbackResponse.url);
      // Consume the response body
      await callbackResponse.text();
    } else {
      console.log("[GateAgent] Step 4: No callback form found");
    }
  }

  // Step 5: Navigate to visitor management to get CSRF token
  console.log("[GateAgent] Step 5: GET /dwelling_live/visitor_management");
  const vmResponse = await fetch(`${baseUrl}/dwelling_live/visitor_management`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  console.log("[GateAgent] Step 5 status:", vmResponse.status, "url:", vmResponse.url);

  const pageHtml = await vmResponse.text();
  console.log("[GateAgent] Step 5 HTML length:", pageHtml.length);

  const csrfMatch = pageHtml.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
  const csrfToken = csrfMatch?.[1] || "";
  console.log("[GateAgent] Step 5: CSRF token found:", !!csrfToken);

  if (!csrfToken) {
    // Check if we got redirected back to login
    const isLoginPage = pageHtml.includes("sign_in") || pageHtml.includes("auth.frontsteps.com");
    console.error("[GateAgent] No CSRF. Is login page:", isLoginPage);
    console.error("[GateAgent] Page snippet:", pageHtml.substring(0, 500));
    throw new Error(
      isLoginPage
        ? "Login failed — check your FrontSteps email and password in Settings"
        : "Could not extract CSRF token — unexpected page content"
    );
  }

  return csrfToken;
}

/**
 * Get CSRF token, using cache when fresh.
 */
async function getCsrfToken(): Promise<string> {
  if (cachedCsrf && Date.now() < cachedCsrf.expiresAt) {
    return cachedCsrf.token;
  }
  const token = await loginToFrontSteps();
  cachedCsrf = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

/**
 * Submit a visitor pass directly from the device.
 * No server needed — uses fetch (patched by CapacitorHttp for native HTTP).
 * Session cookies are managed by the native cookie jar.
 */
export async function submitVisitorClient(
  visitor: VisitorRequest
): Promise<{ success: boolean; message: string }> {
  console.log("[GateAgent] submitVisitorClient called");

  const credentials = await getCredentials();
  const homeId = credentials?.homeId || DEFAULT_HOME_ID;
  const userId = credentials?.userId || DEFAULT_USER_ID;

  let csrfToken: string;
  try {
    csrfToken = await getCsrfToken();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Login failed";
    console.error("[GateAgent] login error:", msg);
    return { success: false, message: msg };
  }

  const body = buildVisitorBody(visitor, homeId, userId);
  const baseUrl = DEFAULT_BASE_URL;

  console.log("[GateAgent] POST /dwelling_live/guests");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/dwelling_live/guests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json, text/plain, */*",
        "X-CSRF-Token": csrfToken,
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify(body),
    });
    console.log("[GateAgent] POST guests status:", response.status);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Network error";
    console.error("[GateAgent] POST guests error:", msg);
    return { success: false, message: `Network error: ${msg}` };
  }

  if (response.status === 401 || response.status === 403) {
    // Session expired — retry with fresh login
    console.log("[GateAgent] 401/403 — retrying with fresh login");
    cachedCsrf = null;
    try {
      csrfToken = await getCsrfToken();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Re-login failed";
      return { success: false, message: msg };
    }

    const retryResponse = await fetch(`${baseUrl}/dwelling_live/guests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json, text/plain, */*",
        "X-CSRF-Token": csrfToken,
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify(body),
    });
    console.log("[GateAgent] retry status:", retryResponse.status);

    if (retryResponse.status < 200 || retryResponse.status >= 300) {
      return { success: false, message: `API error ${retryResponse.status} after re-login` };
    }
  } else if (response.status < 200 || response.status >= 300) {
    const errorText = await response.text().catch(() => "");
    console.error("[GateAgent] POST guests error:", errorText.substring(0, 200));
    return { success: false, message: `API error ${response.status}` };
  }

  const displayName =
    visitor.firstName || visitor.lastName
      ? [visitor.firstName, visitor.lastName].filter(Boolean).join(" ")
      : visitor.company || "visitor";

  return {
    success: true,
    message: `Visitor pass created for ${displayName}`,
  };
}
