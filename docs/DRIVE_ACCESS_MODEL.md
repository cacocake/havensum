# Shared Drive file — access model (DRIVE-1)

Status: **decided on paper, not implemented and not verified.** Havensum has no Google Drive code. Nothing here has been tested with real Google accounts. The decisions are recorded as G01–G06 in [DECISIONS.md](../DECISIONS.md). DRIVE-2 implements the transport. Before shipping, DRIVE-2 must verify every item in "What DRIVE-2 must verify".

## Decisions in brief

| Topic | Decision (owner, 19 November 2026) |
| --- | --- |
| Scope | `https://www.googleapis.com/auth/drive.file` only. No `drive`, `drive.readonly`, `drive.metadata.readonly` or `drive.appdata`. |
| Creation and ownership | Either person may create the shared file from their app. The app creates it in that person's My Drive and shares it with the partner's Google account as editor. The creator stays the owner. |
| Discovery | The partner opens it once in their app through Google's file picker, filtered to that file where the picker allows it. The app then stores the file ID locally. |
| Sign-out and revocation | Keep everything on the device and pause sync. Nothing is deleted locally or remotely. Unsynced edits wait and merge through the normal review on reconnect. |
| Visibility | Everything financial is shared: all accounts (Personal, Joint, Savings, Investment), transactions, loans, categories, planned costs, plans, outlook and payback tasks. Account tags remain labels, not privacy controls. |
| Display preferences | Stay on each device. The theme and other display settings do not go into the shared file. |

## Why `drive.file`

Google classifies `drive.file` as **non-sensitive** and grants it per file. An app holding it can reach only:

- files it created, and
- files the user opened with it, through the Google Picker or a Drive "Open with" integration.

Google classifies `drive`, `drive.readonly` and `drive.metadata.readonly` as **restricted**. A published app using them needs Google's restricted-scope verification and a yearly CASA-based security assessment. The alternative is to stay in the *Testing* publishing status. There, external test users' authorizations, refresh tokens included, expire seven days after consent.

`drive.appdata` cannot hold this file at all: files in the app data folder cannot be shared with another user.

The cost of `drive.file` is the one-time pick. Sharing a file with someone does not let their copy of the app see it. They must select it in the picker first.

## Who can find, read and update the file

| Who | Find | Read | Update | How |
| --- | --- | --- | --- | --- |
| Creator, through Havensum | Yes | Yes | Yes | The app created the file, so `drive.file` covers it. The app stores the file ID. |
| Partner, through Havensum | After the one-time pick | After the pick | After the pick (editor permission) | Picker selection grants `drive.file` for that file to the partner's authorization. |
| Creator or partner, in the Google Drive UI | Yes (My Drive / Shared with me) | Yes | Yes (they can edit or replace the JSON by hand) | Normal Drive permissions. Manual edits bypass the app, so the app must validate every read (below). |
| Anyone else | No | No | No | The app shares only with the partner email the creator enters. If an owner adds other people in Drive, those people can read everything. The app does not prevent that, and the file is not encrypted. |
| Havensum on a third device of either person | After picking it on that device | Yes | Yes | Each installation (Android, each browser origin) keeps its own file ID and baseline. A new installation picks the file once. |

What the file contains: the same versioned full-state JSON as today's backup (schema version 4: accounts, categories, transactions, loans, events, plans, outlook, payback tasks, interest schedules). Device-only data stays out of it: theme and display preferences (G06), the merge baseline (`melo-sync-base`), recovery copies and the plan-invitation deferral. Today `preferences` holds `visibility` and `cushion`. No code reads either value. DRIVE-2 must list every top-level state key and mark it shared or device-only. If any key is unclear, ask the owner.

## How access is set up

1. **Sign-in and consent.** Each person authorizes Havensum for `drive.file` with their own Google account.
   - Android: Google's `AuthorizationClient` (`Identity.getAuthorizationClient(...).authorize(...)`).
   - Web: the Google Identity Services token model. It issues a short-lived access token and no refresh token in the browser.
2. **Create (first person).** "Create shared file":
   - uploads the current local state as a new JSON file in the creator's My Drive;
   - shares it as **writer** with the partner's Google email (Drive `permissions.create`);
   - stores the file ID and records the uploaded state as this device's baseline.
3. **Open (partner).** "Open shared file" launches Google's picker:
   - On the web it uses the Picker with `setAppId` set to the Cloud project number, which `drive.file` requires.
   - On Android it uses the desktop/mobile Picker in the system browser. It returns `picked_file_ids` to the redirect. Google documents an optional `file_ids` filter that can limit the picker to the shared file.
   - The app then reads the file and validates it (schema validation and migration, as restore does today). It does not replace the partner's local data. A partner who already has entries merges them through the existing three-way review. Their baseline is empty, so overlapping records appear for review and nothing is silently dropped. DRIVE-2 must design that first-join review.
4. **Steady state.** Each device reads the file, runs `mergeThreeWay(baseline, local, remote)`, asks the person about conflicts and writes the merged result. Then it updates its local baseline.

## How access changes

| Event | Effect on Drive | Effect in Havensum (G04) |
| --- | --- | --- |
| A person signs out of Drive in Havensum | Their token is revoked (`oauth2.googleapis.com/revoke` / `AuthorizationClient.revokeAccess`). The file and its sharing are unchanged. | The ledger, baseline and stored file ID stay on the device. Sync shows *Paused — reconnect*. Local edits continue and wait. |
| A person removes Havensum's access in their Google Account settings | The app's tokens stop working. Google does not document whether `drive.file` per-file grants survive re-consent; one developer report says they do not. | Same as sign-out. On reconnect, the app tries the stored file ID. If it is not reachable, the person picks the same file again (the picker can be filtered to that ID). |
| The creator removes the partner's permission in Drive | The partner can no longer read or write. | The partner's device keeps its local copy (it cannot be wiped remotely) and pauses sync with a clear message. Their unsynced edits stay local. |
| The partner removes the file from "Shared with me" | Hides it from their Drive view only. Their permission remains. | Not a revocation. Sync should continue. DRIVE-2 must verify this. |
| The creator deletes (trashes) the file | The file goes to the creator's trash. Neither person can use it until it is restored. | Both devices pause. Neither device deletes anything. Recovery: restore it from trash, or either person creates a new shared file from their local state (step 2). The other person then picks it and merges. |
| One person stops using Havensum | Nothing changes until someone removes the permission or the file. | The remaining device keeps working against the file. |
| Ownership transfer | Google allows a transfer between two personal accounts only as a pending-owner request that the recipient accepts. | Not offered in the app. The creator stays owner (G03). Changing it is a manual Drive action and does not change the file ID. |

The app never silently picks a different file, re-creates the file, or overwrites the remote with an unreviewed local state after access returns. A changed file ID always needs an explicit person action: create or pick.

## Constraints the transport must respect

- **No conditional writes.** Drive API v3 documents no `If-Match`/ETag precondition for `files.update`. Its `version`, `headRevisionId`, `md5Checksum` and `modifiedTime` support only read-compare-write, which can still race. DRIVE-2 therefore needs one of two things: a write protocol that detects a lost race after writing and recovers by re-merging, or a protocol it proves safe. It must not assume an atomic compare-and-swap.
- **Manual edits and corruption.** Anyone with Drive access can replace the JSON. Every read goes through `validateState`/`migrateState`, as restore does. An invalid remote never overwrites local data. It produces a visible error and a downloadable copy.
- **Baseline.** S03 (the local last-synced baseline in `melo-sync-base`) stays open. DRIVE-2 must decide how the baseline ties to a file ID and remote revision, so that a baseline from one file is never used against a different file.
- **Privacy.** The file is plain JSON in the creator's Drive, readable by both people and by anyone they share it with. Havensum adds no encryption (G05).

## What DRIVE-2 must verify (with real accounts)

1. The owner's Cloud setup (below) works on both platforms with `drive.file` alone. Check whether an unverified-app screen appears with only the non-sensitive scope in Production. A community report says it can appear even with a verified brand.
2. The creator's app creates the file, shares it with the partner as writer, and can read and update it.
3. Before the pick, the partner's app **cannot** read the file by ID. After picking it on web and on Android, it can read and update it.
4. Android: the desktop/mobile Picker flow, including the redirect and its client type, returns the file ID and grants access. Check whether it needs an API key.
5. Revocation: after sign-out or removal in Google Account settings, check whether the stored file ID still works on re-consent or the file must be picked again. Check that the app pauses rather than deleting anything.
6. Permission removal, "remove from Shared with me", trash and restore behave as in the table above on both devices.
7. Two devices: independent edits merge silently; same-field and edit/delete conflicts and concurrent plan revisions are reviewed; interrupted and stale writes cannot lose data (DRIVE-2 acceptance in the backlog).
8. A manually corrupted or older-schema remote file is rejected or migrated without changing local data.
9. Theme and display preferences do not travel between devices.
10. Testing-status token expiry (seven days) is either avoided by publishing to Production or documented as a known reconnect.

## DRIVE-2 blocker: setup the owner must provide

None of this exists yet, and these steps cannot be done from a cloud session:

1. A **Google Cloud project** owned by the owner, with the **Google Drive API** and the **Google Picker API** enabled.
2. An **OAuth consent screen** (Google Auth Platform → Branding/Audience):
   - user type External;
   - app name Havensum and a support email;
   - the single scope `.../auth/drive.file`;
   - both owners' Google accounts as **test users** while in Testing (authorizations then expire after seven days).
   - Optionally publish to **Production** later. With only a non-sensitive scope, Google does not require verification. Brand verification shows the name and logo.
3. **OAuth client IDs:**
   - **Android:** the final package name (ANDROID-1; currently `com.melo.money` in app.json) plus the **SHA-1** of each signing key used, one client per package/certificate pair (debug, upload and Play App Signing keys).
   - **Web:** the authorized JavaScript origins where the web build will run (at least a local development origin). No hosted origin exists, and this handoff must not create hosting bindings unless the owner asks.
   - Any client type the Android desktop/mobile Picker redirect needs (verify in DRIVE-2).
4. An **API key** restricted to the Picker API (web Picker; and the mobile Picker if it needs one). Treat it as configuration, never committed with credentials.
5. The **project number** (the Picker `appId`).
6. Both owners available to sign in on a test Android device and a browser.

Client IDs and API keys must not be committed. DRIVE-2 must agree with the owner where they live: environment configuration or EAS secrets.

## Sources

The research ran through search results. This session could not open developers.google.com or support.google.com directly. DRIVE-2 must re-read these pages before implementing.

- Drive scopes and classifications: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- App data folder (not shareable): https://developers.google.com/workspace/drive/api/guides/appdata
- Web Picker and `setAppId`: https://developers.google.com/workspace/drive/picker/guides/web-picker, https://developers.google.com/workspace/drive/picker/reference/picker.pickerbuilder.setappid
- Desktop/mobile Picker: https://developers.google.com/workspace/drive/picker/guides/overview-desktop, https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker
- Testing status, 100 test users, seven-day expiry: https://support.google.com/cloud/answer/15549945
- Restricted-scope verification: https://support.google.com/cloud/answer/13463817
- Brand verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- OAuth token revocation: https://developers.google.com/identity/protocols/oauth2
- Android authorization: https://developer.android.com/identity/authorization
- Android OAuth client (package + SHA-1): https://support.google.com/cloud/answer/15549257
- Web token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Removing third-party access: https://support.google.com/accounts/answer/13533235
- Ownership transfer: https://support.google.com/drive/answer/2494892, https://developers.google.com/workspace/drive/api/guides/transfer-file
- v2→v3 (no `etag` in v3): https://developers.google.com/drive/api/guides/v2-to-v3-reference
