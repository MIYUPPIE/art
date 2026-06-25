# Deploying to a VPS

This is a **static site**. The server needs no Node, no build step — just to serve
the files over **HTTPS**. `three` and `mind-ar` load from jsDelivr at runtime.

## The one hard requirement: HTTPS

Camera access (`getUserMedia`) only works in a **secure context**. `localhost` is
exempt, but a VPS reached over `http://<ip>` is **not** — the browser blocks the
camera and the app shows a "Not a secure context" error. You need TLS, which means
a **domain name pointing at the VPS** (for an automatic Let's Encrypt cert).

## Recommended: Caddy (automatic HTTPS)

```bash
# On the VPS (Debian/Ubuntu) — install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

```bash
# From your machine — copy the app (exclude dev-only stuff)
rsync -av --exclude node_modules --exclude .git \
  ./ user@your-vps:/var/www/ar-art/
```

Put `deploy/Caddyfile` at `/etc/caddy/Caddyfile`, change `your-domain.com` to your
domain, then:

```bash
sudo systemctl restart caddy
```

Open `https://your-domain.com/?debug=1`, confirm the HUD shows `secureContext : true`,
allow the camera, and point it at the example card. Done.

## Alternative: nginx + certbot

If you already run nginx, add a static `server {}` block for the domain, get a cert
with `certbot --nginx`, and set the document root to the project folder. No special
MIME config is required — the app only loads `.js` (mapped everywhere) and `.mind`
(fetched as binary). Block `/tools/serve.mjs`, `/tests/`, `/node_modules/` from being
served.

## Zero-VPS option

If the VPS is just for this, a static host is less work and HTTPS is automatic:
**Cloudflare Pages / Netlify / Vercel / GitHub Pages**. Drag-and-drop or connect the
repo. Nothing else changes.

## Pre-deploy checklist

- [ ] Confirmed it tracks locally: webcam on the example card flips the HUD to `FOUND`.
- [ ] Domain DNS points at the VPS; ports 80 + 443 open.
- [ ] Served over `https://` (not `http://<ip>`).
- [ ] `node_modules/` and the scratch dir are NOT deployed.
- [ ] If using your own artwork: compiled `.mind` is in `targets/` and `src/config.js`
      `targetSrc` points at it.
- [ ] After deploy: `https://your-domain/?debug=1` shows `secureContext: true`,
      `MindAR loaded: true`, `target HTTP: 200`.
