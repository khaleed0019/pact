# PACT demo video — recording script

**Output:** `demo/PACT-demo.mp4` (1920×1080, H.264 + AAC, 4:03) with an embedded English
subtitle track, and `demo/PACT-demo.srt` for players that want a separate file.

**What it is:** a real Playwright screen recording of the app, not a mock-up. The app ran
locally as a production build (`next start`) on the in-memory store, seeded with invented
sample data (`demo/seed.mjs`). No real wallets, funds, users or production data appear.
The narration is Windows' built-in "Microsoft Mark" voice — no API key or network needed.

## Chapters and narration

| # | Starts | Chapter | On screen | Narration |
|---|---|---|---|---|
| 01 | 0:01 | What PACT is | Landing page hero with the Seal | This is PACT, a Nimiq Pay mini app that turns a real work agreement into a traceable, verified payment. A brand posts a clear brief, both sides sign the exact terms with their wallets, and payment is checked on chain. |
| 02 | 0:16 | Who it's for | Scroll: audiences, Brief → Agree → Deliver → Pay, a live campaign card, "why the record holds up" | The landing page explains who it's for, brands and contributors, and the four steps: brief, agree, deliver, and pay. It also says plainly what PACT is not. It never holds funds. Money goes straight from wallet to wallet. |
| 03 | 0:33 | Choose a role | Tap *Explore the demo* → first-run role screen → *I'm a Contributor* → *Continue* | Inside Nimiq Pay you would continue with your wallet. In a normal browser we use the demo, which is clearly marked as sample data. The first time you sign in, PACT asks how you will use it. We'll start as a contributor. |
| 04 | 0:48 | Contributor dashboard | "Invitations for you", open campaigns, agreements | The contributor dashboard is built from real records. At the top is an invitation a brand sent directly to this account. Below it are open campaigns and the agreements already in progress. |
| 05 | 1:01 | Find work | Find work → Open tab → filter *Video*, *All*, *USDT*, *Any currency* | Find work lists public campaigns. You can filter by type of work, by currency, and by whether spots are still open. Invite only campaigns never appear in this list. |
| 06 | 1:19 | Search and details | Type "banner" → open *Design a launch banner set* | Let's search for a banner job and open it. Each campaign shows the reward per person, the deadline, how many spots are left, and the full brief with its requirements. |
| 07 | 1:30 | Read the terms first | *Review the agreement* → scroll the preview | Before committing, the contributor reads the exact agreement they would get. The platform, how to submit, and the number of revision rounds all become signed terms. |
| 08 | 1:41 | A private invitation | Back → *Invitations* tab | Now the invitation. It is bound to this wallet. Nobody else can see it, open it, or accept it, and a private campaign never shows up in the public list. |
| 09 | 1:52 | Accept, then sign | *Review invitation* → read terms → *Accept — you'll sign next* | Accepting does not sign anything. It creates the agreement, and both sides still sign the exact terms with their wallets before any work starts. |
| 10 | 2:03 | The agreement | New agreement: progress stepper, "Not signed" for both, *Read and sign* | The agreement page shows real progress from saved data: terms written, both signatures, work submitted, review, payment sent, and finally verified on the network. |
| 11 | 2:15 | Switch to Brand | Account menu → *Switch from Contributor* → *I'm a Brand* | The same wallet can switch roles from the account menu. Agreements already made stay exactly as they are. |
| 12 | 2:28 | Brand dashboard | "Post your first campaign" | As a brand, the dashboard starts with posting work. Once campaigns are live, it separates what posting could commit, what has been agreed, and what has been verified as paid. A budget is never money set aside. |
| 13 | 2:43 | Post a campaign | *Post work* → Invite only, Video, title, brief, requirement | Posting work takes a title, a brief, the type of work, requirements, a reward, the number of spots, and a deadline. This one will be invite only. |
| 14 | 3:04 | Invite by handle | Type "@maya" → pick *@maya_edits* → reward 20, 1 spot, deadline | Contributors can be invited by their Pact handle or an exact wallet address. The search shows the wallet next to each handle, because the invitation is bound to that wallet. |
| 15 | 3:16 | Track the campaign | *Send to 1 person* → owner view: budget, invitation "Waiting for an answer" | Once it's sent, the brand tracks the invitation and the people working. The budget shows the most this campaign could commit, what's been agreed, and only the payments the network has confirmed. |
| 16 | 3:28 | Verified payments | Demo agreement: progress, then the receipt labelled "Demo payment" | A wallet sending money only marks a payment as sent. PACT reads the Nimiq network itself and shows verified only when the transaction matches the agreement. This demo payment is sample data, and it says so. |
| 17 | 3:42 | Light and dark | Account menu → Appearance → *Light* | There's a light theme too. By default it simply follows your phone. |
| 18 | 3:52 | PACT | Sign out → landing page in light | PACT. A clear brief, signed terms, and a trackable payment, inside Nimiq Pay. It's open source under the MIT license. |

## What the video deliberately does not show

- **A real wallet signature or payment.** Signing and paying need the Nimiq Pay app; a
  normal browser has no wallet provider, so the video uses the demo account and stops at
  the payment sheet's honest states. The demo payment is labelled "Demo payment — no
  transaction exists". Record those steps on a phone inside Nimiq Pay for a full demo.
- **A second person accepting the brand's invitation.** The recording uses one browser
  session; the cross-wallet flow is covered by `scripts/e2e-two-wallets.mjs` (52/52).

## How to reproduce

Requirements: Node, ffmpeg on PATH, Windows (for the narration voice), and Playwright
installed somewhere outside the repo (`npm i playwright` — not a project dependency).

```bash
# 1. Production build, served on the in-memory store with a throwaway session secret
npx next build
SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= SESSION_SECRET=<any 64 hex chars> npx next start -p 3100

# 2. Sample data (never point this at production)
node demo/seed.mjs http://localhost:3100

# 3. Narration (Windows OneCore voice "Microsoft Mark")
powershell -ExecutionPolicy Bypass -File demo/tts.ps1 -Out demo/build/audio

# 4. Record (run where playwright is installed; PACT_ROOT points at the repo)
PACT_ROOT=<repo> node demo/record.mjs http://localhost:3100 <repo>/demo/build

# 5. Compose the 1080p video with chapters, captions, subtitles and narration
PACT_ROOT=<repo> node demo/compose.mjs
```

Restart the server and re-seed before each recording: the demo account's role and the
invitation are consumed by the walkthrough.
