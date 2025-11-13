# Punters Taproom Display

Punters is a digital beer board for pubs, taprooms, and tasting rooms. It keeps every TV in sync with your latest taps, prices, and house promos, so guests always see what’s pouring and what’s on offer.

## Why venues use Punters
- **Sell what’s on now.** Instantly update taps, ABV, or prices from the admin overlay; changes hit every screen immediately.
- **Upsell without printing.** Drop in seasonal offers, sponsor slides, or QR promos that rotate between beer pages.
- **Look polished on any TV.** Light/dark themes, custom backgrounds, and optional logos keep your brand front and center.
- **Stay resilient.** Runs locally (no cloud dependency) with offline caching, so the board keeps working even if Wi‑Fi flakes out.

## What you can show
- Current draft list with brewery, style, ABV, and price per pour size.
- Guest beers, cocktails, or other drinks organized by category.
- Promotional artwork or sponsor slides, including paired vertical images.
- Optional logo badge with custom positioning, size, and background.
- Countdown footer that tells guests when the next page/slide appears.

## Control without leaving the floor
- Pull up the admin overlay on any display to edit taps, upload media, or tweak layout.
- Hide the logo or footer per slide to keep promos full-bleed.
- Pair or unpair images with a click; drag to reorder playlists.
- Pause or skip slides on-demand for tastings or special announcements.

## Fits your setup
- **Main + client TVs:** Run one “main” device (Raspberry Pi, mini PC, old laptop) and connect as many browser-based clients as you like.
- **Multi-screen awareness:** Choose per-screen modes (ads-only, beers-only, drinks, or rotate everything) while keeping rotations aligned.
- **Network-friendly:** Auto-discovers servers on your LAN, or point a client directly at a URL.

## Get started
1. **Pick your hardware.** Any modern device with Node.js (Pi 4+, mini PC, or desktop) works as the server. TVs just need a browser.
2. **Install Punters.** The fastest path is the Raspberry Pi installer or Docker script (see below). Devs can also run `npm run dev` locally.
3. **Load your menu.** Use the admin overlay to add sizes, beers, and promos. Changes appear instantly across every screen.
4. **Customize the look.** Set rotation timing, colors, logos, and pairing preferences that fit your space.

### Install options
- **Raspberry Pi kiosk:** `sudo /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-install.sh)"`
- **Docker host (Pi, mini PC, cloud VM):** `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/main/deploy/install.sh)" -- --port 80 --data-dir /opt/punters/data --image ghcr.io/rafiki270/punters:latest`
- **Manual/dev setup:** Clone this repo, run `make install`, then `npm run dev` (server) and `npm run dev:web` (frontend).

Need wiring diagrams, API docs, or contributor notes? Check **[TECH.md](TECH.md)** for the full engineering handbook, including architecture, commands, and deployment details.
