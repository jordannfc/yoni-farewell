# Yoni's Farewell — Setup (the ~15 min of clicking only you can do)

Everything is built. This gets it live. Do the steps in order; paste two values back
to me (or into `config.js` + `Code.gs` yourself) and it's done.

**The only two values that matter:**
- `APPS_SCRIPT_URL` — from Step 1
- `GOOGLE_CLIENT_ID` — from Step 2 (skip Step 2 entirely if you want name-only)

---

## Step 0 — Drop the photos (1 min)
Put Yoni's photos in the `assets/` folder named `yoni-1.jpg` … `yoni-5.jpg`
(and optionally `og-image.jpg`). See `assets/README.txt`. No code changes needed.

---

## Step 1 — Deploy the backend (Apps Script) → gives you APPS_SCRIPT_URL (~5 min)

1. Go to **https://script.google.com** (signed in as your **personal** Google account).
2. **New project**. Delete the empty `myFunction` code.
3. Open `Code.gs` from this folder, copy **all** of it, paste it in. Rename the project
   "Yoni Farewell" (top-left) if you like.
4. *(Only if you're doing Google Sign-In)* — you'll come back and paste your Client ID
   into the `GOOGLE_CLIENT_ID` line at the top of `Code.gs` after Step 2, then redeploy.
   For name-only, leave it `""`.
5. Click **Deploy ▸ New deployment**.
   - Gear icon ▸ **Web app**.
   - **Description:** anything.
   - **Execute as:** **Me**.
   - **Who has access:** **Anyone**.
   - **Deploy**.
6. It will ask you to **authorize** — approve it (this is *your* app writing to *your* Drive).
   You may see "Google hasn't verified this app" → **Advanced ▸ Go to Yoni Farewell (unsafe)**
   → **Allow**. This warning is only for you (the owner), never for party guests.
7. Copy the **Web app URL** — it ends in `/exec`. **That's `APPS_SCRIPT_URL`.**

> The Sheet ("Yoni Book - Entries") and photo folder ("Yoni Book - Photos") are created
> automatically in your Drive the first time someone submits. Nothing to pre-make.
>
> ⚠️ Any future change to `Code.gs` needs **Deploy ▸ Manage deployments ▸ (edit) ▸ New version**
> — otherwise the `/exec` URL keeps running the old code.

---

## Step 2 — Google Sign-In (OPTIONAL) → gives you GOOGLE_CLIENT_ID (~8 min)

Skip this whole step for name-only. To enable "Sign in with Google":

1. Go to **https://console.cloud.google.com** → create/pick a project (top bar).
2. **APIs & Services ▸ OAuth consent screen**:
   - User type **External** ▸ Create.
   - App name "Yoni's Farewell", your email for support + developer contact. Save.
   - **Scopes:** don't add any (default `openid`, `email`, `profile` are non-sensitive →
     **no verification / no scary warning** for guests).
   - **Publishing status:** click **Publish app ▸ Confirm** ("In production").
3. **APIs & Services ▸ Credentials ▸ Create credentials ▸ OAuth client ID**:
   - Application type **Web application**.
   - **Authorized JavaScript origins ▸ Add URI:**  `https://jordannfc.github.io`
     *(origin only — no path, no trailing slash. This is your GitHub Pages host from Step 4.)*
   - Create. Copy the **Client ID** (looks like `1234-abc.apps.googleusercontent.com`).
     **That's `GOOGLE_CLIENT_ID`.**
4. Paste that same Client ID into **`Code.gs`** (the `GOOGLE_CLIENT_ID` line at the top),
   then redeploy the backend as a **New version** (Step 1's warning).

> Testing locally before it's on GitHub? Also add `http://localhost:5500` (or whatever
> port you use) as an authorized origin, or Sign-In won't render locally.

---

## Step 3 — Fill in `config.js` (1 min)
Open `config.js` and set:
```js
APPS_SCRIPT_URL: "https://script.google.com/.../exec",   // from Step 1
GOOGLE_CLIENT_ID: "1234-abc.apps.googleusercontent.com",  // from Step 2, or "" for name-only
```
(Or just paste the two values to me and I'll do it.)

---

## Step 4 — Publish to GitHub Pages → gives you the public URL (~4 min)

1. Create a **new public repo** on GitHub named **`yoni-farewell`**.
2. Upload every file from this folder (`index.html`, `styles.css`, `app.js`, `config.js`,
   `Code.gs` is fine to include, and the `assets/` folder). Drag-and-drop in the browser
   works: **Add file ▸ Upload files ▸** drop them ▸ **Commit**.
3. **Settings ▸ Pages ▸ Build and deployment ▸ Source: Deploy from a branch ▸
   Branch: `main` / `root` ▸ Save.**
4. Wait ~1 min. Your site is at **`https://jordannfc.github.io/yoni-farewell/`**.

> The OAuth **origin** you registered in Step 2 is `https://jordannfc.github.io`
> (no `/yoni-farewell`) — that's correct; origins never include the path.

---

## Step 5 — At the party
- **QR code:** paste your Pages URL into any QR generator (e.g. qr-code-generator.com) and
  print it on table cards. (Tell me the final URL and I'll generate one for you.)
- **Close the book:** open the Sheet "Yoni Book - Entries" ▸ **settings** tab ▸ set **B1 = TRUE**.
  New submissions stop; the closed message shows; the photo wall stays viewable.
- **Hide a bad photo/entry:** on the **Entries** tab, set that row's **hidden** column to `TRUE`.

---

## Quick smoke test (do this once before the party)
1. Open your Pages URL on your phone.
2. Tap **Sign the book**, (sign in if enabled), add a name + a photo, submit.
3. You should land on the wall with your photo at the top.
4. Check your Drive: "Yoni Book - Entries" sheet has a row; "Yoni Book - Photos" has your photo.

If anything errors, tell me what you see — the most common one is forgetting to redeploy a
**New version** after editing `Code.gs`.
