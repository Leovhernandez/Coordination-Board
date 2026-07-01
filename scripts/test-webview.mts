// N1 guard: the "finish in your browser" step must appear ONLY inside an in-app
// webview, never when the link already opened in the system browser (or a
// cookie-sharing view). Run:
//   npx --yes tsx scripts/test-webview.mts
import { isInAppWebview } from "../lib/webview.ts";

function check(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : ` -> ${detail}`}`);
  if (!cond) process.exitCode = 1;
}

// MUST NOT steer (real system browsers + cookie-sharing views → normal login,
// no extra step). A false here would add a needless step to a working login.
const NO_STEER: Record<string, string> = {
  "desktop Chrome (Windows)":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "desktop Safari (macOS)":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Android Chrome (real)":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  "Android Firefox (real)":
    "Mozilla/5.0 (Android 13; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
  "Android Chrome Custom Tab (shares Chrome jar)":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  "iOS Safari (real)":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "iOS Chrome (CriOS)":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1",
  "iOS SFSafariViewController (shares Safari jar)":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
};

// MUST steer (isolated/ephemeral webview cookie jar → session wouldn't persist).
const STEER: Record<string, string> = {
  "Android System WebView (; wv)":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36",
  "Android Gmail in-app WebView (; wv)":
    "Mozilla/5.0 (Linux; Android 12; SM-G991B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36",
  "Facebook in-app (FBAN/FBAV)":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
  "Instagram in-app":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0",
  "Outlook mobile in-app":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 OutlookMobile/4.2",
  "iOS WKWebView (no Safari token)":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

for (const [name, ua] of Object.entries(NO_STEER)) {
  check(`no-steer: ${name}`, isInAppWebview(ua) === false, ua);
}
for (const [name, ua] of Object.entries(STEER)) {
  check(`steer:    ${name}`, isInAppWebview(ua) === true, ua);
}

check("empty UA does not steer", isInAppWebview("") === false, "empty");

console.log("done");
