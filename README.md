<div align="center">

# ⚒ BidForge

**A real-time competitive auction platform built for speed, clarity, and control.**

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)

*CodeBidz 2026 · Hackathon Submission · Team: Absolute Cinema*

</div>

---

## Overview

BidForge is a full-stack real-time auction platform where participants compete for items using a credit-based system. It features two distinct interfaces — a **Live Arena** for bidders and a **Control Room** for administrators — backed by Firebase's real-time database and secured with granular Firestore rules.

An AI assistant is embedded in both the admin and bidder flows, helping admins draft auction listings and helping bidders form competitive strategies on the fly.

---

## Architecture Overview

```mermaid
graph TB
    subgraph Client["🖥️  React Frontend (Vite + TypeScript)"]
        Auth["Auth.tsx\nLogin / Sign Up"]
        App["App.tsx\nRole Router"]
        Navbar["Navbar.tsx\nCredits · Notifications · Profile"]
        Admin["AdminPanel.tsx\nControl Room"]
        Bidder["BidderPanel.tsx\nLive Arena + Dashboard"]
        Card["AuctionCard.tsx"]
    end

    subgraph Firebase["🔥  Firebase Backend"]
        FAuth["Firebase Auth\nEmail/Password · Google OAuth"]
        FS["Firestore\nReal-time DB"]
        Rules["Security Rules\nRole-based access"]
    end

    subgraph AI["🤖  AI Assistant"]
        AIService["geminiService.ts\nAuction details · Bid strategy"]
    end

    Auth -->|sign in / sign up| FAuth
    FAuth -->|auth state| App
    App -->|role = admin| Admin
    App -->|role = bidder| Bidder
    Admin -->|CRUD auctions\nManage users| FS
    Bidder -->|place bids\nread auctions| FS
    FS -->|real-time snapshots| Admin
    FS -->|real-time snapshots| Bidder
    FS -.->|enforced by| Rules
    Admin -->|generate listing| AIService
    Bidder -->|get bid strategy| AIService
```

---

## User Authentication Flow

```mermaid
flowchart TD
    A([User visits BidForge]) --> B{Has account?}
    B -- No --> C[Sign Up\nEmail + Password\nor Google OAuth]
    B -- Yes --> D[Sign In]
    C --> E{First user\nin Firestore?}
    E -- Yes --> F[Role = admin\nautomatically]
    E -- No --> G{Email matches\nadmin allowlist?}
    G -- Yes --> F
    G -- No --> H[Role = bidder\n1000 credits granted]
    D --> I[useAuth hook\nloads Firestore profile]
    F --> J[Admin Panel]
    H --> I
    I --> K{role in profile}
    K -- admin --> J
    K -- bidder --> L[Bidder Panel]
```

---

## Credit & Bidding Transaction Flow

```mermaid
sequenceDiagram
    participant B as Bidder
    participant App as BidForge Frontend
    participant TX as Firestore Transaction
    participant DB as Firestore DB

    B->>App: Enter bid amount & confirm
    App->>TX: Begin atomic transaction

    TX->>DB: Read auction doc
    DB-->>TX: auction data (status, currentBid, endTime)

    TX->>DB: Read bidder user doc
    DB-->>TX: bidder data (credits, lockedCredits, isFlagged)

    alt Auction ended or not active
        TX-->>App: ❌ Error — auction unavailable
    else Bidder is flagged
        TX-->>App: ❌ Error — account restricted
    else Bid too low
        TX-->>App: ❌ Error — must exceed current bid
    else Insufficient credits
        TX-->>App: ❌ Error — not enough balance
    else All checks pass
        TX->>DB: Lock credits on bidder
        TX->>DB: Unlock credits for previous high bidder
        TX->>DB: Write new Bid document
        TX->>DB: Update auction currentBid + currentBidder
        TX->>DB: Write transaction records
        TX-->>App: ✅ Bid placed successfully
        App-->>B: UI updates, notification sent
    end
```

---



---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.8 |
| **Build Tool** | Vite 6 |
| **Styling** | Tailwind CSS 4, inline CSS tokens |
| **Animation** | Motion (Framer Motion v12) |
| **Icons** | Lucide React |
| **Backend / DB** | Firebase Firestore (real-time) |
| **Auth** | Firebase Authentication (Email/Password + Google OAuth) |
| **AI Assistant** | LLM API via server-side proxy (configurable) |
| **Date Utilities** | date-fns |
| **Utilities** | clsx, tailwind-merge |

---

## Features

### 🔨 Bidder Experience
- **Live Arena** — Browse all active auctions in real time with countdown timers and live current-bid updates
- **Place Bids** — Atomic Firestore transactions lock credits on bid submission and automatically unlock them if outbid
- **AI Bidding Strategy** — Get a suggested bid amount and reasoned strategy for any active auction at the click of a button
- **Personal Dashboard** with four sections:
  - **Overview** — account balance, active bid count, won item count, recent transactions
  - **Current Engagements** — live view of every auction you are actively competing in, with winning/outbid status
  - **Financial History** — full transaction log filterable by event type (top-ups, locks, unlocks, final payments)
  - **Victory Gallery** — all auctions you have won, with final prices
- **Notifications** — real-time in-app alerts (e.g. auction won, outbid)
- **Credit System** — visible available balance and locked balance in the navbar at all times

### 🛠 Admin Control Room
- **System Dashboard** — live stats (active listings, total bid volume, registered users) plus an interactive **3D Bid Heatmap** showing bids-per-minute per active auction (draggable/rotatable)
- **Auction Management** — create, close, and delete auctions; AI-assisted title-to-description + reserve price generation
- **Bid Activity Tab** — four live analytics charts:
  - Bids per minute (line, last 30 min)
  - Top 5 auctions by bid count (bar)
  - Cumulative bid value over time (area)
  - Individual bid amounts (scatter-line, last 50)
  - Each chart is expandable into a full-screen modal with hover tooltips and keyboard navigation
- **Live Bid Feed** — scrollable real-time table of every bid across all auctions, filterable by auction
- **User Management** — search users, top up credits, flag/unflag suspicious accounts with reason
- **Flagged Bidders** — dedicated review queue for flagged accounts
- **Auction Replay** — timeline replay of every bid in a closed auction

### 🔐 Security
- Firestore security rules enforce role-based access at the database level
- Bidding handled entirely in Firestore transactions — no race conditions, no double-spending
- Anti-spam bid rate limiting enforced in the transaction
- Flagged users are blocked from placing bids at the transaction level

### 🎨 UI / UX
- Dark-first design with neon green (credits added) and neon red (credits deducted) currency indicators
- Animated perspective grid on the login page with light/dark toggle
- Profile dropdown: name, UID (copyable), role badge, member since, sign out
- All charts rendered with zero external charting dependencies (pure Canvas 2D API)

---

## Firestore Data Model

```mermaid
erDiagram
    USERS {
        string uid PK
        string email
        string displayName
        string role
        number credits
        number lockedCredits
        boolean isFlagged
        string flagReason
        string createdAt
    }

    AUCTIONS {
        string id PK
        string title
        string description
        string imageUrl
        number minBid
        number currentBid
        string currentBidderId FK
        string currentBidderName
        string startTime
        string endTime
        string status
        string winnerId FK
        string createdBy FK
        number bidFrequency
    }

    BIDS {
        string id PK
        string auctionId FK
        string bidderId FK
        string bidderName
        number amount
        string timestamp
    }

    TRANSACTIONS {
        string id PK
        string userId FK
        number amount
        string type
        string description
        string timestamp
    }

    NOTIFICATIONS {
        string id PK
        string userId FK
        string title
        string message
        string type
        boolean read
        string timestamp
    }

    USERS ||--o{ BIDS : "places"
    USERS ||--o{ TRANSACTIONS : "has"
    USERS ||--o{ NOTIFICATIONS : "receives"
    AUCTIONS ||--o{ BIDS : "receives"
    USERS ||--o{ AUCTIONS : "wins"
```

---

## Setup Instructions

### Prerequisites

- Node.js 18 or higher
- A Firebase project with **Firestore** and **Authentication** enabled
- An API key for the AI assistant (optional — the app works without it, AI buttons will be disabled)

---

### Setup Flow

```mermaid
flowchart LR
    A([Clone repo]) --> B[npm install]
    B --> C[Create Firebase project\nEnable Auth + Firestore]
    C --> D[Add firebase-applet-config.json]
    D --> E[Deploy firestore.rules]
    E --> F[Set admin email\nin useAuth.ts\n+ firestore.rules]
    F --> G[Add .env\nwith API key\noptional]
    G --> H([npm run dev\nlocalhost:3000])

    style A fill:#1a1a1a,color:#fff,stroke:#00ff88
    style H fill:#1a1a1a,color:#fff,stroke:#00ff88
    style F fill:#1a1a1a,color:#fff,stroke:#ffb800
```

---

### 1. Clone the repository

```bash
git clone https://github.com/your-username/bidforge.git
cd bidforge
```

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Configure Firebase

Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com), then:

1. Enable **Firestore Database** (production mode)
2. Enable **Authentication** → Sign-in methods → **Email/Password** and **Google**
3. Go to **Project Settings → Your apps → Web app** and copy the config

Create `firebase-applet-config.json` in the project root:

```json
{
  "apiKey": "YOUR_API_KEY",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "projectId": "YOUR_PROJECT_ID",
  "storageBucket": "YOUR_PROJECT.appspot.com",
  "messagingSenderId": "YOUR_SENDER_ID",
  "appId": "YOUR_APP_ID",
  "firestoreDatabaseId": "(default)"
}
```

---

### 4. Deploy Firestore security rules

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

Or paste `firestore.rules` directly into the Firebase console Rules editor.

---

### 5. ⚠️ Set your admin email

BidForge grants admin privileges in two ways — first-registered user, and a hardcoded admin email allowlist. To make your email a permanent admin, update **two files**:

**`src/hooks/useAuth.ts`** — find and replace this line (it appears **twice**):

```ts
// BEFORE
const isAdminEmail = firebaseUser.email === 'your-placeholder@email.com';

// AFTER — replace with your actual email
const isAdminEmail = firebaseUser.email === 'you@yourdomain.com';
```

**`firestore.rules`** — find and replace this line:

```js
// BEFORE
request.auth.token.email == "your-placeholder@email.com"

// AFTER
request.auth.token.email == "you@yourdomain.com"
```

> **Note:** The very first user to register on a fresh deployment is also automatically promoted to admin, regardless of email address.

---

### 6. Configure the AI assistant (optional)

```bash
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY="your_api_key_here"
```

AI features (auction description generation, bidding strategy) silently disable themselves if no key is present — everything else works normally.

---

### 7. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

### 8. Build for production

```bash
npm run build
```

Output goes to `dist/`. For Firebase Hosting:

```bash
firebase init hosting   # point to dist/, configure as SPA
firebase deploy --only hosting
```

---

## Project Structure

```
bidforge/
├── src/
│   ├── components/
│   │   ├── AdminPanel.tsx      # Control room: charts, auctions, users, flags
│   │   ├── AuctionCard.tsx     # Single auction card in Live Arena
│   │   ├── Auth.tsx            # Login / sign-up with animated grid + dark toggle
│   │   ├── BidderPanel.tsx     # Live Arena + personal dashboard
│   │   ├── ErrorBoundary.tsx   # Top-level error boundary
│   │   └── Navbar.tsx          # Credits · notifications · profile dropdown
│   ├── contexts/
│   │   └── ThemeContext.tsx     # Auth-page light/dark toggle state
│   ├── hooks/
│   │   └── useAuth.ts          # Firebase auth state + Firestore profile sync
│   ├── lib/
│   │   ├── auctionActions.ts   # Atomic Firestore transaction for placing bids
│   │   ├── firestoreUtils.ts   # Error handling helpers
│   │   └── utils.ts            # formatCurrency, cn()
│   ├── services/
│   │   └── geminiService.ts    # AI API calls: auction details + bid strategy
│   ├── App.tsx                 # Root layout, role-based routing
│   ├── index.css               # Design-system tokens + global overrides
│   ├── main.tsx                # React entry point
│   └── types.ts                # Shared TypeScript interfaces
├── firebase-applet-config.json # Firebase credentials  ← git-ignored
├── firestore.rules             # Firestore security rules
├── .env.example                # Environment variable template
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Known Limitations

| # | Limitation | Impact |
|---|---|---|
| 1 | **No image upload** — auction images are URLs only | Admins must paste image links manually |
| 2 | **No email notifications** — alerts are in-app only | Users must be logged in to see auction outcomes |
| 3 | **No auction scheduling** — auctions start immediately on creation | No future start-time or draft state |
| 4 | **No role management UI** — admin/bidder promotion must be done in Firestore directly | Requires Firebase console access to change roles |
| 5 | **No pagination on large datasets** — bid feed fetches up to 200 records at once | High-volume deployments may need cursor-based queries |
| 6 | **AI features require a valid API key** — buttons are visible but non-functional without one | Minor UX confusion; no graceful disabled state displayed |
| 7 | **Single credit currency** — no real payment gateway integration | Platform is credits-only, not connected to real money |
| 8 | **Google Sign-In requires authorised domains** — must be configured in Firebase console for production | Sign-in with Google will fail on custom domains until added |

---

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss what you would like to change.

```mermaid
gitGraph
   commit id: "fork repo"
   branch feature/your-feature
   checkout feature/your-feature
   commit id: "make changes"
   commit id: "add tests"
   checkout main
   merge feature/your-feature id: "open pull request"
```

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a pull request

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built with ⚒ by Team Absolute Cinema · CodeBidz 2026</sub>
</div>
