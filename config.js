/* =============================================================================
   Yoni's Farewell — Frontend config
   -----------------------------------------------------------------------------
   Fill in the two values marked TODO after you deploy the backend and (optionally)
   create the Google OAuth client. Everything else has a sensible default.
   ============================================================================= */

window.CONFIG = {
  // TODO (required): the Apps Script Web App /exec URL (from SETUP.md, Step 3).
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycby7GOZX7hml5KFMgVUjut9dYhh_jJN0FTte4EinzD9Li1Q0kL9l6SHC0nSDAmmzkJEm9A/exec",

  // TODO (optional): Google OAuth Client ID (from SETUP.md, Step 2).
  //   - Leave as "" to run in NAME-ONLY mode (no Google Sign-In). The site works fully.
  //   - Paste the client ID to turn on "Sign in with Google" automatically.
  GOOGLE_CLIENT_ID: "39894390702-tkmapdifhpot6m911lpffbodb7is32ns.apps.googleusercontent.com",

  // --- Copy / behaviour -------------------------------------------------------
  DEADLINE_TEXT: "Get it in before 11pm tonight (AEST).",
  MAX_PHOTOS: 3,
  MAX_MESSAGE_CHARS: 1000,

  // How often the live photo wall polls for new photos (milliseconds).
  FEED_POLL_MS: 12000,

  // Client-side photo handling.
  PHOTO_MAX_EDGE: 1600,   // longest edge in px before upload
  PHOTO_JPEG_QUALITY: 0.8,
  ENABLE_HEIC: true,      // convert iPhone HEIC via CDN lib when needed
};
