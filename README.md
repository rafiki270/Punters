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
- Signature cocktails with hero image, manual ingredients line, and a single house price (toggle on/off when ingredients run out).
- Promotional artwork or sponsor slides, including paired vertical images.
- Optional logo badge with custom positioning, size, and background.
- Countdown footer that tells guests when the next page/slide appears.

## Control without leaving the floor
- Pull up the admin overlay on any display to edit taps, upload media, or tweak layout.
- Hide the logo or footer per slide to keep promos full-bleed.
- Pair or unpair images with a click; drag to reorder playlists.
- Pause or skip slides on-demand for tastings or special announcements.

### Cocktails made simple
- Create and edit cocktails from the dedicated **Cocktails** tab—upload a photo, paste ingredients, enter one price, and you’re done.
- Keep the board accurate with the Enable/Disable toggle (soft archive) so out-of-stock drinks disappear without losing their details.
- Cocktail slides share the same layout controls as Other Drinks (cell scale, indent, items-per-column) and can be shown alongside beers, drinks, or media per screen.
- Arrangements now expose Beer, Drinks, Cocktails, and Media checkboxes, letting you mix and match content per TV without touching the rest of the playlist.

## Fits your setup
- **Main + client TVs:** Run one “main” device (Raspberry Pi, mini PC, old laptop) and connect as many browser-based clients as you like.
- **Multi-screen awareness:** Choose per-screen modes (ads-only, beers-only, drinks, or rotate everything) while keeping rotations aligned.
- **Network-friendly:** Auto-discovers servers on your LAN, or point a client directly at a URL.

## Get started
1. **Pick your hardware.** A Raspberry Pi 4, fanless mini PC, or spare desktop can act as the “main” player; TVs only need a browser window pointed at it.
2. **Install Punters.** Use the one-line installers below to pull the repo, install dependencies, and wire up kiosk mode.
3. **Launch the board.** From the project directory run:

```bash
make launch80
```

Prefer the default dev ports? Run:

```bash
make launch
```

4. **Keep it running.** Install Punters as a system service so it auto-starts on boot:

```bash
sudo make service
```
5. **Load your menu.** Open the Admin overlay, add sizes, beers, and promos, and the TVs will update in seconds.

### Install options
- **Raspberry Pi kiosk:**

```bash
sudo /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-install.sh)"
```

- **Docker host (Pi, mini PC, cloud VM):**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/main/deploy/install.sh)" -- --port 80 --data-dir /opt/punters/data --image ghcr.io/rafiki270/punters:latest
```

- **Manual/dev setup (clone → install → launch):**

```bash
make install
make launch80
```

### One-click updates
Need the latest fixes? Open the Admin overlay, head to the System tab, and press **Check for updates**. Punters fetches the newest code and runs `git pull --ff-only` in the background, so you can keep serving beers while it updates.

Need wiring diagrams, API docs, or contributor notes? Check **[TECH.md](TECH.md)** for the full engineering handbook, including architecture, commands, and deployment details.
