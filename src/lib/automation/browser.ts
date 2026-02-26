import { chromium, BrowserContext, Page } from "playwright";
import { VisitorRequest, CapturedAPICall } from "@/types/visitor";
import { SessionTokens } from "@/lib/api-client/frontsteps-api";
import path from "path";
import fs from "fs";

const PLAYWRIGHT_DATA_DIR = path.join(process.cwd(), "playwright-data");
const BROWSER_PROFILE_DIR = path.join(PLAYWRIGHT_DATA_DIR, "browser-profile");
const API_CAPTURES_FILE = path.join(process.cwd(), "api-captures.json");

let context: BrowserContext | null = null;

function getBaseUrl(): string {
  return process.env.FRONTSTEPS_BASE_URL || "https://blackhawk-hoa.frontsteps.com";
}

export async function getBrowserContext(): Promise<BrowserContext> {
  // Check if existing context is still alive
  if (context) {
    try {
      // Test if context is still usable by checking pages
      context.pages();
      return context;
    } catch {
      // Context is stale/closed, reset it
      console.log("Browser context was stale, creating new one...");
      context = null;
    }
  }

  // Ensure data directories exist
  if (!fs.existsSync(BROWSER_PROFILE_DIR)) {
    fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });
  }

  // Use launchPersistentContext — this stores ALL cookies, localStorage,
  // and session data in the browser-profile folder, just like a real browser.
  // This is critical for Auth0 callbacks to work properly.
  context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  // Set up API interceptor on the context
  setupAPIInterceptor(context);

  return context;
}

function setupAPIInterceptor(ctx: BrowserContext): void {
  ctx.on("response", async (response) => {
    const url = response.url();
    // Only capture API calls to FrontSteps domains
    if (
      !url.includes("frontsteps.com") ||
      url.includes(".js") ||
      url.includes(".css") ||
      url.includes(".png") ||
      url.includes(".svg") ||
      url.includes(".ico")
    ) {
      return;
    }

    try {
      const request = response.request();
      const capture: CapturedAPICall = {
        timestamp: Date.now(),
        url: url,
        method: request.method(),
        headers: await request.allHeaders(),
        requestBody: request.postData() || undefined,
        responseStatus: response.status(),
        responseBody: undefined,
      };

      // Try to capture response body for API calls
      try {
        if (
          response.headers()["content-type"]?.includes("application/json")
        ) {
          capture.responseBody = await response.text();
        }
      } catch {
        // Response body may not be available
      }

      appendAPICapture(capture);
    } catch {
      // Ignore capture errors
    }
  });
}

function appendAPICapture(capture: CapturedAPICall): void {
  let captures: CapturedAPICall[] = [];
  if (fs.existsSync(API_CAPTURES_FILE)) {
    try {
      captures = JSON.parse(fs.readFileSync(API_CAPTURES_FILE, "utf-8"));
    } catch {
      captures = [];
    }
  }
  captures.push(capture);
  // Keep last 500 captures
  if (captures.length > 500) {
    captures = captures.slice(-500);
  }
  fs.writeFileSync(API_CAPTURES_FILE, JSON.stringify(captures, null, 2));
}

/**
 * Check if the page shows a 500 or other error page.
 */
async function isErrorPage(page: Page): Promise<boolean> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return bodyText.includes("Internal Server Error") || bodyText.includes("500");
}


export async function ensureLoggedIn(page: Page): Promise<boolean> {
  const baseUrl = getBaseUrl();

  // First navigate to the base/home page to check login status
  // This is more reliable than going directly to visitor_management
  await page.goto(baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // Wait for redirects to settle
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const currentUrl = page.url();
  console.log("Current URL after navigation:", currentUrl);

  // If we're on auth.frontsteps.com or a sign_in page, we need to log in
  if (
    currentUrl.includes("auth.frontsteps.com") ||
    currentUrl.includes("/sign_in") ||
    currentUrl.includes("/login")
  ) {
    console.log("Not logged in, performing login...");
    return await performLogin(page);
  }

  // We're on the app — logged in
  console.log("Already logged in.");
  return true;
}

async function performLogin(page: Page): Promise<boolean> {
  const email = process.env.FRONTSTEPS_EMAIL;
  const password = process.env.FRONTSTEPS_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "FRONTSTEPS_EMAIL and FRONTSTEPS_PASSWORD must be set in .env.local"
    );
  }

  // Debug: log password length and first/last char to help diagnose env parsing issues
  console.log(
    `Credentials loaded - email: ${email}, password length: ${password.length}, ` +
    `first char: "${password[0]}", last char: "${password[password.length - 1]}"`
  );

  const baseUrl = getBaseUrl();

  // If not already on the Auth0 page, navigate to sign_in to trigger the redirect
  const currentUrl = page.url();
  if (!currentUrl.includes("auth.frontsteps.com")) {
    await page.goto(`${baseUrl}/users/sign_in`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    // Wait for Auth0 redirect to complete
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  }

  console.log("Login page URL:", page.url());

  // Wait for the Auth0 login form to load
  await page.waitForSelector(
    'input[name="username"], input[name="email"], input[type="email"]',
    { timeout: 15000 }
  );

  // Fill email
  const emailInput = page.locator(
    'input[name="username"], input[name="email"], input[type="email"]'
  ).first();
  await emailInput.clear();
  await emailInput.fill(email);

  // Small delay
  await page.waitForTimeout(500);

  // Fill password (both fields on the same page)
  const passwordInput = page.locator(
    'input[name="password"], input[type="password"]'
  ).first();
  await passwordInput.clear();
  await passwordInput.fill(password);

  await page.waitForTimeout(500);

  // Click the login/submit button
  // The FrontSteps Auth0 login page uses a green "LOG IN" button
  const loginButton = page.locator([
    'button:has-text("LOG IN")',
    'button:has-text("Log In")',
    'button:has-text("Log in")',
    'button:has-text("Sign In")',
    'button[type="submit"]',
    'input[type="submit"]',
    'button[name="action"]',
    'a:has-text("LOG IN")',
  ].join(", ")).first();

  await loginButton.waitFor({ state: "visible", timeout: 10000 });
  console.log("Clicking login button...");
  await loginButton.click();

  // Wait a moment, then check for login error before waiting for navigation
  await page.waitForTimeout(3000);

  // Check if login failed (wrong email/password)
  const errorText = await page.locator('text="Wrong email or password"').isVisible().catch(() => false);
  if (errorText) {
    throw new Error(
      "Login failed: Wrong email or password. Check your .env.local credentials. " +
      "If your password has special characters like $, try escaping them with \\ " +
      "(e.g., pa\\$\\$word) and remove any quotes around the value."
    );
  }

  // Wait for navigation away from Auth0 back to the FrontSteps app
  await page.waitForURL(
    (url) => {
      const href = url.toString();
      return (
        !href.includes("auth.frontsteps.com") &&
        !href.includes("/sign_in") &&
        !href.includes("/login")
      );
    },
    { timeout: 30000 }
  );

  // CRITICAL: Wait for the post-login page to fully load.
  // Auth0 redirects through a callback URL that sets session cookies.
  // We must let this complete before navigating anywhere else.
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  console.log("Login complete, URL:", page.url());

  // Take a screenshot of the post-login page for debugging
  await page.screenshot({
    path: path.join(PLAYWRIGHT_DATA_DIR, "after-login.png"),
  });

  console.log("Login successful!");
  return true;
}

/**
 * Extract session cookies and CSRF token from the browser context.
 * Used by the direct API client to make authenticated requests.
 */
export async function getSessionTokens(): Promise<SessionTokens> {
  const ctx = await getBrowserContext();
  const page = ctx.pages()[0] || (await ctx.newPage());
  const baseUrl = getBaseUrl();

  // Ensure we're logged in first
  await ensureLoggedIn(page);

  // Get cookies for the FrontSteps domain
  const cookies = await ctx.cookies(baseUrl);
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  if (!cookieString) {
    throw new Error("No session cookies found - login may have failed");
  }

  // Navigate to visitor management to get a fresh CSRF token
  await page.goto(`${baseUrl}/dwelling_live/visitor_management`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Extract CSRF token from the page meta tag
  const csrfToken = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta?.getAttribute("content") || "";
  });

  if (!csrfToken) {
    throw new Error("Could not extract CSRF token from page");
  }

  console.log(
    `Session tokens extracted - cookies: ${cookieString.length} chars, CSRF: ${csrfToken.substring(0, 10)}...`
  );

  return { cookies: cookieString, csrfToken };
}

export async function createVisitor(
  visitor: VisitorRequest
): Promise<{ success: boolean; message: string }> {
  try {
    const ctx = await getBrowserContext();
    const page = ctx.pages()[0] || (await ctx.newPage());
    const baseUrl = getBaseUrl();

    try {
      // Ensure we're logged in
      await ensureLoggedIn(page);

      // Navigate to visitor management
      console.log("Navigating to visitor management...");
      await page.goto(`${baseUrl}/dwelling_live/visitor_management`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      // Check for 500 error
      if (await isErrorPage(page)) {
        console.log("Got 500 error, retrying after going to homepage first...");

        // Go to homepage, wait for it to fully load, then try visitor management again
        await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);

        await page.goto(`${baseUrl}/dwelling_live/visitor_management`, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        if (await isErrorPage(page)) {
          // Still 500 — session might be bad. Clear and re-login.
          console.log("Still 500 after retry. Re-logging in...");
          await page.goto(`${baseUrl}/users/sign_out`, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          }).catch(() => {});
          await page.waitForTimeout(2000);

          await performLogin(page);

          await page.goto(`${baseUrl}/dwelling_live/visitor_management`, {
            waitUntil: "networkidle",
            timeout: 30000,
          });

          if (await isErrorPage(page)) {
            return {
              success: false,
              message:
                "FrontSteps visitor management page returns 500 error. Please try logging in manually at " +
                baseUrl +
                " to verify your account works.",
            };
          }
        }
      }

      console.log("On visitor management page:", page.url());

      // Take a screenshot for debugging
      await page.screenshot({
        path: path.join(PLAYWRIGHT_DATA_DIR, "before-add-click.png"),
      });

      // Step 1: Click the "MANAGE GUESTS" dropdown button
      console.log("Looking for MANAGE GUESTS button...");
      const manageGuestsButton = page.locator(
        'button:has-text("MANAGE GUESTS"), button:has-text("Manage Guests"), a:has-text("MANAGE GUESTS")'
      ).first();
      await manageGuestsButton.waitFor({ state: "visible", timeout: 10000 });
      await manageGuestsButton.click();
      await page.waitForTimeout(500);

      // Step 2: Select the right option from the dropdown
      const menuOption = visitor.guestType === "Permanent"
        ? "Invite a Permanent Guest"
        : "Invite a Temporary Guest";
      console.log(`Selecting "${menuOption}" from dropdown...`);
      const inviteOption = page.locator(`text="${menuOption}"`).first();
      await inviteOption.waitFor({ state: "visible", timeout: 5000 });
      await inviteOption.click();

      // Step 3: Wait for the form to appear then fill it via JavaScript
      console.log("Waiting for invite form to appear...");
      await page.waitForTimeout(3000);

      // Use JavaScript to fill the form directly in the DOM
      // This bypasses any Playwright selector issues
      const fillResult = await page.evaluate((v) => {
        const results: string[] = [];

        // Helper to find input by placeholder text (case-insensitive, includes)
        function findInput(placeholderPart: string): HTMLInputElement | null {
          const inputs = document.querySelectorAll("input");
          for (const inp of inputs) {
            if (inp.placeholder && inp.placeholder.toLowerCase().includes(placeholderPart.toLowerCase()) && inp.offsetParent !== null) {
              return inp;
            }
          }
          return null;
        }

        // Helper to set React-controlled input value
        function setInputValue(input: HTMLInputElement, value: string) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, value);
          } else {
            input.value = value;
          }
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Helper to set textarea value
        function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (nativeSetter) {
            nativeSetter.call(textarea, value);
          } else {
            textarea.value = value;
          }
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // Fill Pass Type select (second select on the page that's visible)
        const selects = Array.from(document.querySelectorAll("select")).filter(s => s.offsetParent !== null);
        if (selects.length >= 2 && v.passType) {
          const passSelect = selects[1];
          const options = Array.from(passSelect.options);
          const match = options.find(o => o.text.toLowerCase().includes(v.passType.toLowerCase()));
          if (match) {
            passSelect.value = match.value;
            passSelect.dispatchEvent(new Event("change", { bubbles: true }));
            results.push(`Set Pass Type to: ${match.text}`);
          }
        }

        // Fill First Name (optional - may only have company)
        if (v.firstName) {
          const firstNameInput = findInput("first name");
          if (firstNameInput) {
            setInputValue(firstNameInput, v.firstName);
            results.push(`Filled First Name: ${v.firstName}`);
          }
        }

        // Fill Last Name (optional - may only have company)
        if (v.lastName) {
          const lastNameInput = findInput("last name");
          if (lastNameInput) {
            setInputValue(lastNameInput, v.lastName);
            results.push(`Filled Last Name: ${v.lastName}`);
          }
        }

        // Fill Company
        if (v.company) {
          const companyInput = findInput("company");
          if (companyInput) {
            setInputValue(companyInput, v.company);
            results.push(`Filled Company: ${v.company}`);
          }
        }

        // Fill Email
        if (v.email) {
          const emailInput = findInput("address@") || findInput("email");
          if (emailInput) {
            setInputValue(emailInput, v.email);
            results.push(`Filled Email: ${v.email}`);
          }
        }

        // Fill Phone
        if (v.phone) {
          const phoneInput = findInput("555") || findInput("phone");
          if (phoneInput) {
            setInputValue(phoneInput, v.phone);
            results.push(`Filled Phone: ${v.phone}`);
          }
        }

        // Fill Start Date
        const dateInputs = Array.from(document.querySelectorAll('input[type="date"]')).filter(
          (el) => (el as HTMLElement).offsetParent !== null
        ) as HTMLInputElement[];
        if (dateInputs.length >= 1 && v.startDate) {
          setInputValue(dateInputs[0], v.startDate);
          results.push(`Filled Start Date: ${v.startDate}`);
        }

        // Fill End Date
        const endDate = v.endDate || v.startDate;
        if (dateInputs.length >= 2 && endDate) {
          setInputValue(dateInputs[1], endDate);
          results.push(`Filled End Date: ${endDate}`);
        }

        // Fill Attendant Notes
        if (v.attendantNotes) {
          const textareas = Array.from(document.querySelectorAll("textarea")).filter(
            (el) => el.offsetParent !== null
          ) as HTMLTextAreaElement[];
          if (textareas.length > 0) {
            setTextareaValue(textareas[0], v.attendantNotes);
            results.push(`Filled Notes: ${v.attendantNotes}`);
          }
        }

        // Handle send ePass checkbox
        if (v.sendEpass && (v.email || v.phone)) {
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(
            (el) => (el as HTMLElement).offsetParent !== null
          ) as HTMLInputElement[];
          for (const cb of checkboxes) {
            const label = cb.closest("label")?.textContent?.toLowerCase().trim()
              || document.querySelector(`label[for="${cb.id}"]`)?.textContent?.toLowerCase().trim()
              || "";
            if (label.includes("epass") || label.includes("e-pass") || label.includes("send e")) {
              if (!cb.checked) {
                cb.click();
                results.push(`Checked send ePass checkbox`);
              }
              break;
            }
          }
        }

        // Handle day-of-week checkboxes for permanent guests
        if (v.daysPermitted && v.daysPermitted.length > 0 && v.guestType === "Permanent") {
          const dayValues = v.daysPermitted.map(String);
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(
            (el) => (el as HTMLElement).offsetParent !== null
          ) as HTMLInputElement[];

          // FrontSteps Sunday-first bitmask
          const dayLabels: Record<string, string[]> = {
            "1": ["sunday", "sun"], "2": ["monday", "mon"],
            "4": ["tuesday", "tue", "tues"], "8": ["wednesday", "wed"],
            "16": ["thursday", "thu", "thur", "thurs"],
            "32": ["friday", "fri"], "64": ["saturday", "sat"],
          };

          for (const cb of checkboxes) {
            // Try matching by value attribute first
            if (dayValues.includes(cb.value)) {
              if (!cb.checked) { cb.click(); results.push(`Checked day: value=${cb.value}`); }
              continue;
            }
            // Try matching by label text
            const label = cb.closest("label")?.textContent?.toLowerCase().trim()
              || document.querySelector(`label[for="${cb.id}"]`)?.textContent?.toLowerCase().trim()
              || "";
            const matchedDay = Object.entries(dayLabels).find(([, names]) =>
              names.some(n => label.includes(n))
            );
            if (matchedDay) {
              const shouldBeChecked = dayValues.includes(matchedDay[0]);
              if (shouldBeChecked && !cb.checked) {
                cb.click();
                results.push(`Checked day: ${label}`);
              } else if (!shouldBeChecked && cb.checked) {
                cb.click();
                results.push(`Unchecked day: ${label}`);
              }
            }
          }
        }

        return results;
      }, {
        firstName: visitor.firstName || "",
        lastName: visitor.lastName || "",
        passType: visitor.passType,
        company: visitor.company || "",
        email: visitor.email || "",
        phone: visitor.phone || "",
        startDate: visitor.startDate,
        endDate: visitor.endDate || visitor.startDate,
        attendantNotes: visitor.attendantNotes || "",
        daysPermitted: visitor.daysPermitted || [],
        guestType: visitor.guestType,
        sendEpass: visitor.sendEpass || false,
      });

      // Log results
      for (const line of fillResult) {
        console.log(line);
      }

      // Take screenshot before submitting
      await page.screenshot({
        path: path.join(PLAYWRIGHT_DATA_DIR, "before-submit.png"),
      });

      // The Submit "button" is actually an <a> tag styled as a button.
      // JS .click() on <a> elements works reliably for triggering event handlers.
      const clickResult = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a"));
        const submitEl = anchors.find(el => {
          const text = el.textContent?.trim().toLowerCase() || "";
          return text === "submit" && (el as HTMLElement).offsetParent !== null;
        });
        if (!submitEl) return "not_found";
        submitEl.scrollIntoView({ block: "center", behavior: "instant" });
        (submitEl as HTMLElement).click();
        return "clicked";
      });

      if (clickResult === "not_found") {
        console.log("ERROR: Could not find Submit element");
        return {
          success: false,
          message: "Could not find the Submit button on the invite form.",
        };
      }

      console.log("Clicked Submit via JS .click()");

      // Wait for the form submission to process
      await page.waitForTimeout(5000);

      // Take screenshot after submit
      await page.screenshot({
        path: path.join(PLAYWRIGHT_DATA_DIR, "after-submit.png"),
      });

      // Verify the modal closed (indicating successful submission)
      const submitSucceeded = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll("a"));
        const submitStillVisible = anchors.some(el =>
          el.textContent?.trim().toLowerCase() === "submit" &&
          (el as HTMLElement).offsetParent !== null
        );
        return !submitStillVisible;
      });

      if (submitSucceeded) {
        console.log("Form submitted successfully - modal closed.");
        const displayName = visitor.firstName || visitor.lastName
          ? [visitor.firstName, visitor.lastName].filter(Boolean).join(" ")
          : visitor.company || "visitor";
        return {
          success: true,
          message: `Visitor pass created for ${displayName}`,
        };
      } else {
        console.log("Form submission may have failed - modal still open.");
        return {
          success: false,
          message: `Form submission did not complete - the modal is still open.`,
        };
      }
    } catch (error) {
      // Take error screenshot
      await page
        .screenshot({
          path: path.join(PLAYWRIGHT_DATA_DIR, "error.png"),
        })
        .catch(() => {});
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to create visitor pass: ${message}`,
    };
  }
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
}
