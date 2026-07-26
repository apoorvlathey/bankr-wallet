# WalletChan Landing Page - Product Requirements Document

**Primary domain**: walletchan.com
**Fallback domain**: walletchan.eth.sh
**Design System**: Bauhaus (see STYLING.md)
**Status**: Planning

---

## Overview

A funky, bold landing page that showcases WalletChan—the browser extension that brings your Bankr terminal wallet into any dapp. The website follows our Bauhaus design system with geometric shapes, primary colors (Red, Blue, Yellow), hard shadows, and constructivist typography.

**Vibe**: Retro-futuristic, Constructivist, Bold, Playful yet Professional, "Wallets should be fun"

---

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS (matching STYLING.md tokens)
- **Font**: Outfit (Google Fonts) - `Outfit:wght@400;500;700;900`
- **Icons**: Lucide React
- **Animations**: Framer Motion (for geometric compositions, scroll reveals)
- **Charts**: Lightweight Charts (TradingView) or Recharts for token price
- **Hosting**: Vercel

---

## Design Tokens (Reference)

```css
/* Colors */
--background: #f0f0f0;
--foreground: #121212;
--primary-red: #d02020;
--primary-blue: #1040c0;
--primary-yellow: #f0c020;
--border: #121212;
--muted: #e0e0e0;
```

---

## Page Sections

### 1. Navigation Bar

**Background**: Off-white (`#F0F0F0`)  
**Border**: `border-b-4 border-black`

**Layout**:

```
┌─────────────────────────────────────────────────────────────────┐
│  [●▲■] WalletChan          Features  Token  Install     [CTA] │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elements**:

- **Logo**: Animated mascot GIF (`walletchan-animated.gif`) + "WalletChan" text in uppercase, font-black
- **Nav Links**: Features | Token | Install | Tweets (uppercase, font-bold, tracking-wider)
- **CTA Button**: "Add to Chrome" - Red primary button with hard shadow

**Mobile**: Hamburger menu with slide-out drawer (black background, white text)

---

### 2. Hero Section

**Layout**: Split asymmetric layout (60/40 on desktop, stacked on mobile)  
**Left Side**: Off-white background  
**Right Side**: Blue (`#1040C0`) color block with geometric composition

```
┌─────────────────────────────────────────────────────────────────┐
│                                          │     ◯               │
│  PULL YOUR BANKR                         │       ▢             │
│  WALLET INTO                             │    △                │
│  ANY DAPP                                │                     │
│                                          │   [Mascot GIF       │
│  Like MetaMask, but powered by AI.       │    animated,        │
│  Transaction execution through the       │    breathing]       │
│  Bankr API. No seed phrases needed.      │                     │
│                                          │                     │
│  [ADD TO CHROME]  [VIEW ON GITHUB]       │                     │
│                                          │                     │
│  Works on: Chrome · Brave · Arc          │                     │
└─────────────────────────────────────────────────────────────────┘
```

**Typography**:

- Headline: `text-5xl sm:text-6xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.9]`
- Subtext: `text-lg sm:text-xl font-medium text-gray-700 max-w-md`

**Buttons**:

- Primary: "Add to Chrome" (Red, shadow-[8px_8px_0px_0px_black])
- Secondary: "View on GitHub" (Outline, white bg)

**Geometric Composition (Right Panel)**:

- Large circle (Yellow, 40% opacity, top-right)
- Rotated square (Red, 30% opacity, bottom-left)
- Animated mascot centered with pulsing glow effect

**Animation**:

- Mascot "breathes" (subtle scale animation)
- Geometric shapes float/rotate slowly
- Text reveals on scroll (staggered)

---

### 3. Stats Bar

**Background**: Yellow (`#F0C020`)  
**Border**: `border-y-4 border-black`

```
┌─────────────────────────────────────────────────────────────────┐
│    ◯              │      ▢             │      △              │
│   4+              │     50+            │    100%             │
│  CHAINS           │   TRANSACTIONS     │  OPEN-SOURCE        │
│  SUPPORTED        │   PER DAY          │                     │
└─────────────────────────────────────────────────────────────────┘
```

**Layout**: 3-column grid with `divide-x-4 divide-black`

**Each Stat**:

- Geometric shape icon (circle/square/triangle) in alternating colors
- Large number: `text-4xl lg:text-6xl font-black`
- Label: `text-sm uppercase tracking-widest font-bold`

**Animation**: Numbers count up on scroll into view

---

### 4. Features Section

**Background**: Off-white (`#F0F0F0`)  
**Section Title**: "FEATURES" (Red text, geometric underline)

**Layout**: 3-column grid on desktop, 1-column on mobile

```
┌─────────────────────────────────────────────────────────────────┐
│                         FEATURES                                 │
│                         ─────────                                │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ ◯            │  │ ▢            │  │ △            │          │
│  │              │  │              │  │              │          │
│  │ AI-POWERED   │  │ SIDE PANEL   │  │ MULTI-CHAIN  │          │
│  │ TRANSACTIONS │  │ MODE         │  │ SUPPORT      │          │
│  │              │  │              │  │              │          │
│  │ Execute via  │  │ Keep wallet  │  │ Base, ETH,   │          │
│  │ Bankr API    │  │ visible, no  │  │ Polygon,     │          │
│  │ prompts      │  │ popups!      │  │ Unichain     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ PER-TAB      │  │ SECURE       │  │ EIP-6963     │          │
│  │ CHAINS       │  │ STORAGE      │  │ COMPATIBLE   │          │
│  │              │  │              │  │              │          │
│  │ Different    │  │ AES-256-GCM  │  │ Works with   │          │
│  │ chains in    │  │ encryption   │  │ all modern   │          │
│  │ diff tabs    │  │ for API key  │  │ dapps        │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

**Feature Cards**:

- White background
- `border-4 border-black shadow-[8px_8px_0px_0px_black]`
- Small geometric shape decorator in top-right corner (8x8px)
- Icon in bordered box
- Title: uppercase, font-bold
- Description: font-medium, text-gray-700
- `hover:-translate-y-2 transition-transform duration-200`

**Features to Highlight**:

1. **AI-Powered Transactions** - Execute transactions through Bankr API prompts
2. **Side Panel Mode** - Keep wallet visible while browsing, no annoying popups
3. **Multi-Chain Support** - Base, Ethereum, Polygon, Unichain (show chain icons)
4. **Per-Tab Chain State** - Different chains in different browser tabs
5. **Secure Storage** - AES-256-GCM encryption with PBKDF2 (600k iterations)
6. **EIP-6963 Compatible** - Works alongside other wallets with modern dapp discovery
7. **Transaction History** - Track recent transactions with status updates
8. **Browser Notifications** - Get notified when transactions complete

---

### 5. $WCHAN Token Section

**Background**: Blue (`#1040C0`)  
**Text**: White

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│     $WCHAN                                                      │
│     ───────                                                     │
│                                                                 │
│     THE COMMUNITY TOKEN                                         │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                                                            ││
│  │                    [PRICE CHART]                           ││
│  │              (from GeckoTerminal API)                      ││
│  │                                                            ││
│  │    Current Price: $0.00042                                 ││
│  │    24h Change: +12.5%                                      ││
│  │    Market Cap: $420K                                       ││
│  │                                                            ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│     │ DEXSCREENER │  │ GECKOTERMINAL│  │ BUY ON BASE │         │
│     └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                                 │
│     Contract: 0x... [Copy]                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Chart Component**:

- Fetch data from GeckoTerminal API: `https://api.geckoterminal.com/api/v2/networks/base/pools/{pool_address}/ohlcv`
- Style: Yellow line on dark background
- Hard border: `border-4 border-black`
- Time range selector: 1H | 24H | 7D | 30D

**Token Stats Row**:

- Current Price (large, font-black)
- 24h Change (green/red based on direction)
- Market Cap

**Action Buttons**:

- DexScreener (Yellow button)
- GeckoTerminal (Yellow button)
- Buy on Base (Red button, primary CTA)

**Token Address**: Truncated with copy button

---

### 6. How It Works / Installation Guide

**Background**: Off-white (`#F0F0F0`)  
**Section Title**: "GET STARTED IN 60 SECONDS"

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│               GET STARTED IN 60 SECONDS                         │
│               ─────────────────────────                         │
│                                                                 │
│   ┌───┐         ┌───┐         ┌───┐         ┌───┐             │
│   │ 1 │─────────│ 2 │─────────│ 3 │─────────│ 4 │             │
│   └───┘         └───┘         └───┘         └───┘             │
│                                                                 │
│  DOWNLOAD      ENABLE DEV     LOAD THE      ENTER API          │
│  EXTENSION     MODE           EXTENSION     KEY                │
│                                                                 │
│  [Screenshot]  [Screenshot]   [Screenshot]  [Screenshot]       │
│                                                                 │
│  Get the       Toggle on      Click "Load   Get your key       │
│  latest        Developer      unpacked"     from bankr.bot     │
│  release       mode in        and select    and you're         │
│  from GitHub   extensions     the folder    ready!             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Step Cards Layout**: 4-column on desktop, 2x2 on tablet, stacked on mobile

**Step Numbers**:

- Geometric shapes (alternating circle/square)
- Rotated 45° with counter-rotated inner number
- Colors cycle: Red → Blue → Yellow → Red

**Connecting Line**: Dashed line between steps (hidden on mobile)

**Screenshots**:

- Use existing screenshots from `.github/usage/` and `.github/installation/`
- Screenshots have `border-4 border-black shadow-[8px_8px_0px_0px_black]`
- Grayscale by default, color on hover

**Steps**:

1. **Download** - Get the latest release from GitHub Releases
2. **Enable Developer Mode** - Toggle in chrome://extensions (show screenshot)
3. **Load Extension** - Click "Load unpacked" and select folder
4. **Enter API Key** - Get from bankr.bot/api, enter wallet address, create password

**CTA at bottom**: "Download Latest Release" (Red button linking to GitHub releases)

---

### 7. Screenshot Gallery / Product Showcase

**Background**: Red (`#D02020`)  
**Text**: White

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    SEE IT IN ACTION                             │
│                    ─────────────────                            │
│                                                                 │
│     ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│     │            │  │            │  │            │            │
│     │  Unlock    │  │  Homepage  │  │  Settings  │            │
│     │  Screen    │  │            │  │            │            │
│     │            │  │            │  │            │            │
│     └────────────┘  └────────────┘  └────────────┘            │
│                                                                 │
│                    ┌─────────────────────┐                     │
│                    │                     │                     │
│                    │   Transaction       │                     │
│                    │   Request           │                     │
│                    │                     │                     │
│                    └─────────────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Gallery Style**:

- Screenshots with thick black borders
- Hard shadows
- Slight rotation (-2° to 2°) for dynamic feel
- Hover: straighten + scale up slightly
- Mobile: horizontal scroll carousel

**Screenshots to Include**:

1. `password-page.png` - Unlock screen
2. `homepage-new.png` - Main wallet view
3. `settings.png` - Settings page
4. `tx-request.png` - Transaction confirmation (featured larger)

---

### 8. What People Are Saying (Tweet Grid)

**Background**: Off-white (`#F0F0F0`)  
**Section Title**: "WHAT PEOPLE ARE SAYING"

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│               WHAT PEOPLE ARE SAYING                            │
│               ──────────────────────                            │
│                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│   │ @user1       │  │ @threadguy   │  │ @user3       │        │
│   │ This wallet  │  │ The design   │  │ Finally a    │        │
│   │ is fire 🔥   │  │ is sick!     │  │ good wallet  │        │
│   │              │  │              │  │              │        │
│   │ [♥ 42 🔁 12] │  │ [♥ 156 🔁 38]│  │ [♥ 89 🔁 21] │        │
│   └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│   │ @bankrbot    │  │ @user5       │  │ @polygon     │        │
│   │ Reply tweet  │  │ Love the     │  │ Reply tweet  │        │
│   │              │  │ Bauhaus UI   │  │              │        │
│   └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│                    [SEE MORE ON X →]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Tweet Card Design**:

- White background, `border-4 border-black`, `shadow-[4px_4px_0px_0px_black]`
- Profile picture: `rounded-full grayscale` (color on hover)
- Username: font-bold
- Tweet text: font-medium
- Engagement: likes/retweets with X (Twitter) icons
- Small geometric decorator in corner (cycling colors)
- Clicking opens tweet in new tab

**Layout**:

- Masonry-style grid (3 columns desktop, 2 tablet, 1 mobile)
- Staggered card heights based on content

**Data Source**:

- Curated list of tweet IDs
- Can use Twitter embed or custom styled cards
- Fallback: Screenshot images of tweets

**Notable Tweets to Include**:

- ThreadGuy's stream mention
- Bankrbot official replies
- Polygon reply
- BoredElonMusk engagement
- Community love for the design

---

### 9. Roadmap / Ship Log

**Background**: Yellow (`#F0C020`)  
**Text**: Black

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                        SHIP LOG                                 │
│                        ────────                                 │
│                                                                 │
│   ┌─────┐                                                       │
│   │ ▣ ─┼──► v0.1.0 - Initial Release                           │
│   └─────┘   • Transaction execution                             │
│             • Multi-chain support                               │
│             • Side panel mode                                   │
│                                                                 │
│   ┌─────┐                                                       │
│   │ ○ ─┼──► v0.2.0 - Coming Soon                               │
│   └─────┘   • Token holdings view                               │
│             • Chat interface for Bankr prompts                  │
│             • Custom themes                                     │
│                                                                 │
│   ┌─────┐                                                       │
│   │ △ ─┼──► Future                                             │
│   └─────┘   • WalletConnect integration                         │
│             • Governance voting                                 │
│             • In-wallet swaps                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Timeline Style**:

- Vertical timeline with geometric markers
- Filled shapes = completed
- Outline shapes = upcoming
- Each version links to GitHub release

---

### 10. Community / Links Section

**Background**: Off-white (`#F0F0F0`)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    JOIN THE COMMUNITY                           │
│                    ─────────────────                            │
│                                                                 │
│        ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│        │    𝕏     │    │   ◆      │    │    ★     │           │
│        │ TWITTER  │    │ GITHUB   │    │ BANKR.BOT│           │
│        └──────────┘    └──────────┘    └──────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Social Cards**:

- Large icon buttons
- Hard shadows, thick borders
- Hover: lift effect + color change

**Links**:

- Twitter/X: @apoorveth
- GitHub: Repository link
- Bankr.bot: Get API key
- Discord: (if created)

---

### 11. Final CTA Section

**Background**: Blue (`#1040C0`)  
**Decorations**: Large geometric shapes at 30% opacity in corners

```
┌─────────────────────────────────────────────────────────────────┐
│  ◯                                                         △   │
│                                                                 │
│              READY TO MAKE WALLETS                             │
│              FUN AGAIN?                                        │
│                                                                 │
│              [ADD TO CHROME - IT'S FREE]                       │
│                                                                 │
│                      ▢                                    ◯    │
└─────────────────────────────────────────────────────────────────┘
```

**Typography**:

- Headline: `text-4xl sm:text-6xl lg:text-7xl font-black uppercase text-white`
- Tagline: "Make wallets fun again™"

**CTA Button**:

- Yellow background, black text
- Extra large: `px-12 py-6 text-2xl`
- `shadow-[8px_8px_0px_0px_black]`

---

### 12. Footer

**Background**: Near-black (`#121212`)  
**Text**: White/Gray

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  [●▲■] WalletChan                                             │
│                                                                 │
│  Pull your Bankr wallet out of the           Links:            │
│  terminal and into your browser.             • GitHub          │
│                                              • Twitter         │
│  Contract: 0x... [Copy]                      • Bankr.bot       │
│                                              • Privacy Policy  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Built by @apoorveth                      © 2026 WalletChan   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elements**:

- Logo + tagline
- Token contract address with copy
- Navigation links
- Social icons (X logo)
- Copyright
- "Built by @apoorveth" with link to X profile

---

## Interactive Elements & Animations

### Scroll Animations (Framer Motion)

- Sections fade in from bottom on scroll
- Stats count up when visible
- Cards stagger in
- Geometric shapes parallax effect

### Hover Effects

- Buttons: Press down effect (translate + shadow removal)
- Cards: Lift up (-translate-y-2)
- Images: Grayscale to color
- Links: Underline animation

### Micro-interactions

- Copy button: Checkmark animation on success
- Navigation: Active state indicator (geometric shape)
- Mobile menu: Slide-in with geometric pattern overlay

### Mascot Animation

- Subtle "breathing" effect (scale 1 → 1.02 → 1)
- Blinks occasionally
- Reacts to scroll position (looks in scroll direction)

---

## Responsive Breakpoints

| Breakpoint | Width      | Layout Changes                                      |
| ---------- | ---------- | --------------------------------------------------- |
| Mobile     | < 640px    | Single column, stacked sections, hamburger nav      |
| Tablet     | 640-1024px | 2-column grids, reduced type scale                  |
| Desktop    | > 1024px   | Full layouts, maximum type scale, side-by-side hero |

---

## SEO & Meta

```html
<title>WalletChan - The Wallet for AI Era</title>
<meta
  name="description"
  content="Browser extension that brings your Bankr terminal wallet to any dapp. AI-powered transactions, multi-chain support, no seed phrases needed."
/>

<!-- Open Graph -->
<meta property="og:title" content="WalletChan" />
<meta
  property="og:description"
  content="Pull your Bankr wallet into any dapp, like MetaMask!"
/>
<meta property="og:image" content="https://walletchan.com/og-image.png" />
<meta property="og:url" content="https://walletchan.com" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@apoorveth" />
<meta name="twitter:image" content="https://walletchan.com/twitter-card.png" />
```

---

## Assets Required

### Existing (from repo)

- `walletchan-animated.gif` - Animated mascot
- `walletchan-icon.png` - Static icon
- `.github/usage/*.png` - Extension screenshots
- `.github/installation/developer-mode.png` - Install screenshot
- `public/chainIcons/*.svg` - Chain logos

### To Create

- `og-image.png` - Open Graph image (1200x630)
- `twitter-card.png` - Twitter card image
- Hero illustration / geometric composition
- Favicon set
- Chain icons composite image

---

## API Integrations

### Token-list logo fallback

`GET /api/swap/token-list?chainId=<id>` proxies the CoinGecko token catalog.
The address-aware form, `GET /api/swap/token-list?chainId=<id>&address=<erc20>`,
is the final logo fallback used by the extension when the catalog and pinned
sources have no icon. It constructs the fixed MetaMask CAIP-style token-icon
URL and returns `{ logoUrl }` only after a five-second HEAD request confirms a
PNG. The upstream host is fixed; user input supplies only a validated positive
chain ID and 20-byte ERC-20 address.

### GeckoTerminal API

**Endpoint**: `https://api.geckoterminal.com/api/v2/`

```typescript
// Get pool OHLCV data
GET /networks/base/pools/{pool_address}/ohlcv/day?limit=30

// Get token info
GET /networks/base/tokens/{token_address}

// Response includes:
// - price_usd
// - price_change_percentage (24h)
// - market_cap_usd
// - volume_usd
```

**Update Frequency**: Refresh every 60 seconds or on user interaction

### Twitter/X Embeds

Option A: Use Twitter's oEmbed API for official embeds
Option B: Custom styled cards with curated tweet data (requires manual updates)

---

## Performance Targets

- **Lighthouse Score**: 90+ on all metrics
- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Core Web Vitals**: All green

### Optimizations

- Next.js Image optimization
- Font subsetting (Outfit weights: 400, 500, 700, 900 only)
- Lazy load below-fold sections
- Static generation where possible
- CDN for assets

---

## Development Phases

### Phase 1: Core Landing Page

- [ ] Project setup (Next.js, Tailwind, Framer Motion)
- [ ] Design tokens implementation
- [ ] Navigation + Footer
- [ ] Hero section with geometric composition
- [ ] Features grid
- [ ] Installation guide
- [ ] Final CTA

### Phase 2: Dynamic Content

- [ ] $WCHAN token section with live chart
- [ ] GeckoTerminal API integration
- [ ] Tweet grid section
- [ ] Screenshot gallery

### Phase 3: Polish

- [ ] Scroll animations
- [ ] Mascot micro-interactions
- [ ] Mobile optimization
- [ ] SEO + meta tags
- [ ] Performance optimization

### Phase 4: Launch

- [ ] Domain setup (walletchan.com)
- [ ] Vercel deployment
- [ ] Analytics integration
- [ ] Final QA

---

## File Structure

```
website/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── components/
│       ├── Navigation.tsx
│       ├── Hero.tsx
│       ├── StatsBar.tsx
│       ├── Features.tsx
│       ├── TokenSection.tsx
│       ├── InstallGuide.tsx
│       ├── Screenshots.tsx
│       ├── TweetGrid.tsx
│       ├── Roadmap.tsx
│       ├── Community.tsx
│       ├── FinalCTA.tsx
│       ├── Footer.tsx
│       └── ui/
│           ├── Button.tsx
│           ├── Card.tsx
│           ├── GeometricShape.tsx
│           └── PriceChart.tsx
├── public/
│   ├── images/
│   ├── icons/
│   └── fonts/
├── lib/
│   ├── geckoterminal.ts
│   └── constants.ts
├── tailwind.config.ts
└── next.config.js
```

---

## Notes & Considerations

1. **Bauhaus Purity**: Every element must feel intentionally geometric. No soft shadows, no rounded corners (except perfect circles), no gradients.

2. **Color Discipline**: Stick to the 5-color palette. If more colors are needed, use opacity variations of primaries.

3. **Typography Contrast**: Headlines should feel MASSIVE compared to body text. This creates the poster-like feel.

4. **Hard Shadows Everywhere**: The 4px/8px offset shadows are non-negotiable. They create the constructivist depth.

5. **Playful but Professional**: The design should feel fun (it's a "wallets should be fun" brand) while still conveying technical competence.

6. **Mobile First**: Many users will visit from X/Twitter links on mobile. The experience must be excellent on small screens.

7. **Token Section Sensitivity**: Token price can be volatile. Consider showing chart with neutral framing, not "moon" language.

---

## References

- STYLING.md - Full Bauhaus design system
- COINS.md - `/coins` page: real-time coin launches (SSE streaming, indexer API)
- README.md - Feature list and installation
- IMPLEMENTATION.md - Technical architecture
- TODO.md - Roadmap and marketing ideas

---

## Development Conventions

### Key files

```
apps/website/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── components/        # Hero, Features, TokenSection, etc.
│   └── lib/
│       ├── siteRouting.ts # Domain-aware routing helpers
│       ├── useSiteNav.ts  # React hook wrapping siteRouting for client components
│       └── theme.ts       # Chakra UI Bauhaus theme
```

### Pages that use wagmi / RainbowKit hooks

**CRITICAL**: Any website page (`page.tsx`) that uses wagmi hooks (`useAccount`, `useChainId`, `useReadContract`, etc.) or RainbowKit components (`ConnectButton`) will **fail on Vercel** during `next build` static prerendering with `WagmiProviderNotFoundError`.

**Required pattern** for new pages that use wagmi:

1. Put all page content in a separate `"use client"` file (e.g., `MyPageContent.tsx`)
2. Make `page.tsx` a **Server Component** that imports the content and exports `force-dynamic`:

```tsx
// page.tsx (Server Component — no "use client")
import MyPageContent from "./MyPageContent";

export const dynamic = "force-dynamic";

export default function MyPage() {
  return <MyPageContent />;
}
```

**Why**: `next build` statically prerenders pages at build time. Even though `WagmiProvider` is in the layout, wagmi's config initialization can fail during Node.js prerendering. `force-dynamic` skips prerendering entirely. These pages are inherently dynamic (wallet state) so there's no benefit to static generation.

**Existing pages using this pattern**: `migrate`, `admin`, `coins`, `stake`, `verify`.

**Note**: Pages that only import child components using wagmi (like `swap/page.tsx` importing `SwapCard`) don't need this — only pages that directly use wagmi hooks in the page file itself.

### Domain routing

Website routing is centralized in:

- `apps/website/routing.config.json` — host modes and route registry used by `next.config.js`
- `apps/website/app/lib/siteRouting.ts` — pure URL resolution helpers used by React and server code
- `apps/website/app/lib/useSiteNav.ts` — React hook wrapping `siteRouting.ts`

Host modes:

- `walletchan.com` is the canonical SEO host. Route pages use subdomains: `/stake` resolves to `https://stake.walletchan.com/`, `/os` resolves to `https://os.walletchan.com/`.
- `walletchan.eth.sh` is the direct-access fallback host for ISP/DNS blocks. Route pages use paths: `/stake`, `/os`, `/mainnet`, etc. Do not redirect this host to `walletchan.com`; Next config sends `X-Robots-Tag: noindex, follow` so it does not compete with the canonical host.
- `bankrwallet.app` is a redirect host only. It serves a noindex redirect page that probes `walletchan.com` from the user's browser and falls back to `walletchan.eth.sh` if the primary host cannot load. Next config also sends `X-Robots-Tag: noindex, nofollow` for this host and its registered subdomains.
- Localhost always uses paths so the dev server works normally.

When adding a new routed page, update `apps/website/routing.config.json`, add the route page, and add any required Vercel domains for `slug.walletchan.com`. Do not manually construct `*.walletchan.com`, `walletchan.eth.sh`, or `bankrwallet.app` URLs in components.

**Existing routed pages**: `os`, `stake`, `migrate`, `compare`, `mainnet`, `admin`, `test`.

### Internal wallet test dapp

`/test` is the noindex manual JSON-RPC harness. Its Approval Detection card
keeps direct finite and zero-amount ERC-20 approvals, an
`increaseAllowance(address,uint256)` request, an ERC-5792 batch with a buried
unlimited approval, a Base-only ERC-5792 batch combining unlimited self-approval
with a 1 USDC transfer to the fixed asset-change recipient, and the Ethereum
`alphaUSDCDeltaV2.multicall(bytes[])` shape from the July 2026 drain together.
Standalone `approve` cases verify
that the editable Request details card replaces the duplicate simulation
section; `increaseAllowance` verifies the final post-simulation allowance
without receiving the standalone editor. Test approvals name the connected
account as spender so an accidental confirmation does not delegate token
authority to a third party. The hidden-multicall case is Ethereum-only; the
other cases use the active chain's configured USDC.
Immediately below the connection status, a sticky, horizontally scrollable
section index links to every test card. Section anchors retain enough scroll
margin to stay visible below that index, and smooth movement becomes immediate
when the visitor prefers reduced motion.

### Privacy Pools Explorer

`/privacy-pools-explorer` is an internal admin diagnostic linked only from the
Admin page. It accepts a Shield transaction hash or an Ethereum/Sepolia
Etherscan transaction URL, auto-selects the chain for recognized URLs, and
immediately starts verification when a recognized URL is pasted. Raw hashes
default to Ethereum mainnet and wait for explicit submission. A fixed-endpoint server route verifies
the successful Entrypoint receipt and exact ETH-pool `Deposited` event, exact
ASP deposit metadata, association-tree label membership, and equality between
the ASP root and Entrypoint `latestRoot()`. When available it also resolves the
matching `RootUpdated` publication and reports its onchain time. The ASP does
not expose its internal approval timestamp, so older deposits explicitly show
the current approving-root publication rather than claiming it was the first.

The page is intentionally a main-site path, not a registered subdomain route.
It exports `noindex`/`nofollow` metadata, and `next.config.js` adds a
defense-in-depth `X-Robots-Tag` for the path. Do not add this tool to global
navigation, sitemaps, or marketing pages.

### Cross-domain URL routing

**CRITICAL**: Never construct subdomain URLs manually or use raw `window.location.hostname` checks for routing. Always use the centralized routing helpers:

- **`useSiteNav()` hook** (`apps/website/app/lib/useSiteNav.ts`) — for React components. Provides:
  - `href(path)` — resolves any internal path to the correct URL (handles localhost, `walletchan.com` subdomains, and `walletchan.eth.sh` path routes)
  - `homeHref` — logo/home link (`"/"` on localhost and path hosts, `"https://walletchan.com"` on subdomains)
  - `isOnPage(route)` — checks if on a specific page (works with both pathname and subdomain)
  - `getRouteBasePath(route)` — returns `""` on own subdomain, `"/os"` etc. elsewhere
  - `isLocalhost`, `isOnSubdomain`, `currentRoute`
- **`siteRouting.ts`** (`apps/website/app/lib/siteRouting.ts`) — pure functions for non-React code. Same logic, takes `hostname` as parameter.

**Examples:**

```tsx
// In a component on any page/subdomain:
const { href, homeHref, isOnPage } = useSiteNav();
<Link href={href("/stake")}>Stake</Link>      // localhost/walletchan.eth.sh → "/stake"; walletchan.com → "https://stake.walletchan.com/"
<Link href={href("#install")}>Install</Link>  // anchors stay on the current path host, but target walletchan.com home from subdomains
<Link href={homeHref}>Home</Link>             // "/" on path hosts, "https://walletchan.com" on subdomains
const isOnStake = isOnPage("/stake");         // true on /stake paths OR stake.walletchan.com
```

## Homepage Warm Midnight projection

The experimental homepage in `apps/website/app/home-v2` follows the extension's
approved Warm Midnight direction. The extension production UI remains the
visual source of truth for its 3D product mockups.

- Website and mockup colors come from `home-v2/design.ts`; do not add a second
  local navy, violet, or legacy Bauhaus palette to a preview.
- The default wallet mock mirrors the compact app header, account identity,
  portfolio balance, curved semantic chart, equal quick actions, tabs, asset
  controls, and thin holding rows.
- Do not restore the old permanent `$WCHAN`/WalletChan OS strip or a global
  homepage network selector inside the mock.
- Amber is the brand/action emphasis, blue is transactional, green/red are
  semantic value colors, and graphite surface lightness carries hierarchy.
- Three-dimensional depth remains a website storytelling device, but the
  components projected into that depth retain the extension's thin borders,
  restrained radii, and compact typography.
