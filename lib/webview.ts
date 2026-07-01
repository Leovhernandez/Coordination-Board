/**
 * In-app webview detection for the sign-in interstitial (N1).
 *
 * Pure + dependency-free so it's unit-testable (scripts/test-webview.mts). The
 * ONLY reason this exists is to add the "finish in your browser" step EXCLUSIVELY
 * when the email link opened inside an app's embedded webview — those have an
 * isolated/ephemeral cookie jar, so a session created there doesn't persist. When
 * the link already opened in the system browser (or a cookie-sharing view like
 * iOS SFSafariViewController / Android Custom Tabs), this returns false and the
 * normal, unchanged login flow runs — no extra steps.
 *
 * Conservative by design: a false positive would add a needless step to a working
 * login, so every branch requires a POSITIVE webview signal. Real browsers
 * (desktop/mobile Chrome, Safari, Firefox, Edge, Chrome/Firefox on iOS) return
 * false.
 */
export function isInAppWebview(ua: string): boolean {
  if (!ua) return false;

  // Android System WebView — the embed most in-app browsers use. Real Chrome/
  // Firefox on Android do NOT carry the "; wv)" marker; Custom Tabs use the real
  // browser UA (and share its cookie jar), so neither is flagged.
  if (/; wv\)/.test(ua)) return true;

  // Known in-app browser UA tokens (Facebook, Instagram, Line, Twitter/X,
  // Snapchat, the Google app, Outlook mobile).
  if (
    /(FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|Snapchat|GSA\/|OutlookMobile)/i.test(
      ua,
    )
  ) {
    return true;
  }

  // iOS in-app webview (WKWebView): iPhone/iPad WITHOUT the "Safari" token and not
  // a real third-party browser (Chrome/Firefox/Edge on iOS carry CriOS/FxiOS/
  // EdgiOS). Real Safari and SFSafariViewController include "Safari" and share
  // Safari's cookie jar, so they are NOT flagged.
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS && !/Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) return true;

  return false;
}
