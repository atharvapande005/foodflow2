# FoodFlow

A multi-canteen campus food-ordering platform. Students order from any campus canteen, canteen owners run their own branded canteen, and platform administrators oversee the whole network.

## Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS v4 |
| Backend  | Express 5, TypeScript, Mongoose 8, Zod, Socket.IO, JWT |
| Database | MongoDB via Mongoose. Uses `MONGODB_URI` when set, otherwise the built-in embedded store in `server/.data` |
| Uploads  | Local disk (`server/uploads`) served from `/uploads` |

## Quick start

```bash
npm run setup      # installs server and client dependencies
npm run dev        # server on :5000, client on :3000
```

Open <http://localhost:3000>.

Production build (server first, then client):

```bash
npm run build
npm start          # Express serves the built client from client/dist
```

> The root `npm run build` compiles the API and then builds the React client. Both must pass.

### Demo accounts

| Role     | Email                  | Password      |
| -------- | ---------------------- | ------------- |
| Admin    | `admin@foodflow.app`   | `Admin@12345` |
| Owner    | `owner@foodflow.demo`  | `Owner@12345` |
| Student  | Register from the UI   | —             |

Change these before deploying. Configure them through `server/.env` (see `server/.env.example`).

## Roles

- **Student / Faculty / Staff** — browse active canteens, view each canteen's branded menu, order with a wallet, track orders.
- **Canteen owner** (`CANTEEN_OPERATOR`) — register through the owner sign-up form, create and manage canteens they own, menu, stock, branding, operating hours and orders.
- **Administrator** (`ADMIN`) — manage every canteen, owner assignment, all orders, users and platform analytics. Public registration can never create an admin.

Ownership is always derived from the authenticated JWT/database user. The browser never supplies an owner ID that is trusted for writes.

## Multi-canteen model

- `Canteen` stores identity, institution, contact, branding, settings and `ownerId`.
- `MenuItem` and `Order` carry a `canteen` reference.
- Every owner query is scoped to canteens whose `ownerId` matches the signed-in user.
- Admins are global; owners receive `403`/`404` when they touch another owner's canteen, menu or order.
- Public menu browsing across active canteens remains available to students; management is always scoped.

### Branding

Branding is stored per canteen and rendered as two independent fixed layers behind the UI:

1. the background image layer, with its own `backgroundOpacity` and position;
2. the overlay layer, with its own colour and `overlayOpacity`.

Opacity is never applied to the whole page container, so text, buttons and the logo stay fully opaque and readable. Canteens also have independent primary/secondary/accent/button colours, a logo, tagline, announcement and logo scale.

Images are uploaded to disk (JPEG, PNG, WebP, GIF, AVIF, max 5 MB), stored as URL paths in MongoDB (never base64), and replaced files are deleted. In production mount `server/uploads` on a persistent volume or swap in object storage.

## API overview

| Area | Endpoints |
| ---- | --------- |
| Auth | `POST /api/auth/register`, `POST /api/auth/register/owner`, `POST /api/auth/login`, `GET/PATCH /api/auth/me` |
| Canteens | `GET /api/canteens`, `GET /api/canteens/mine`, `POST /api/canteens`, `PUT /api/canteens/:id`, `PATCH /api/canteens/:id/branding`, `PATCH /api/canteens/:id/status`, `DELETE /api/canteens/:id` |
| Sessions | `GET /api/canteens/:id/session`, `POST /api/canteens/:id/session/start`, `POST /api/canteens/:id/session/close` |
| Menu | `GET /api/menu`, `POST /api/menu`, `PUT /api/menu/:id`, `DELETE /api/menu/:id`, `GET /api/menu/inventory`, `GET/POST/PATCH/DELETE /api/menu/categories` |
| Orders | `POST /api/orders`, `GET /api/orders/my`, `GET /api/orders`, `GET /api/orders/summary`, `PATCH /api/orders/:id/status` |
| Payments | `GET /api/payments/config`, `POST /api/payments/online/order`, `POST /api/payments/verify`, `POST /api/payments/failed`, `POST /api/payments/webhook` |
| Cash counter | `POST /api/cash/orders`, `GET /api/cash/orders`, `PATCH /api/cash/orders/:id/paid` |
| Public QR | `GET /api/public/canteens/:code`, `POST /api/public/orders`, `GET /api/public/orders/:id?phone=` |
| Revenue | `GET /api/revenue`, `GET /api/revenue/sessions`, `GET /api/revenue/canteens` |
| Wallet | `GET /api/wallet/balance`, `POST /api/wallet/topup`, `GET /api/wallet/transactions` |
| Analytics | `GET /api/analytics/dashboard`, `GET /api/analytics/sales`, `GET /api/analytics/users` |
| Uploads | `POST /api/uploads/image?kind=logo\|background\|avatar\|menu` |

## Data migration and backwards compatibility

On boot the server seeds a default `Main Canteen` (`MAIN`) and a demo owner if needed, then links any legacy menu items or orders without a canteen to `MAIN`. Legacy records therefore stay usable; no document is deleted during migration.

The embedded MongoDB store automatically selects the newest cached `mongod` binary when opening an existing `server/.data` directory, so a store created by a newer MongoDB version still opens.

## Ordering safety

- Prices are read from the database, never from the client.
- Stock is reserved atomically with `$inc` and rolled back if any line fails.
- Wallet payment, refunds and stock release are transactional at the application level; cancelling an order refunds the wallet and restores stock exactly once.
- Cancelled/completed orders cannot be cancelled twice.
- Orders can only contain items from a single canteen.

## Operating sessions and tokens

Each canteen runs an **operating session**. Owners start a session from the session bar on Overview, Orders or Cash pages. While a session is open:

- every new order is assigned the next 3-digit token (`#001`, `#002`, … `#143`);
- tokens are allocated with an atomic counter on the session document, so concurrent orders never share a token;
- stock is restored from each item's **daily prep quantity** (`defaultStock`) when a new session starts;
- closing a session stops new orders. Historical sessions and orders are never deleted.

Only one session can be `OPEN` per canteen, enforced by a partial unique MongoDB index. Restarting a session resets the token sequence to `#001` while all previous tokens remain in order history.

## Payments, cash and revenue

- **Wallet** — the price is read from the database, the wallet is charged atomically, and the order is created only after stock is reserved. Cancelling refunds the wallet exactly once and restores stock.
- **Online (Razorpay)** — the server creates the FoodFlow order and the Razorpay order, then verifies the signature and amount in `POST /api/payments/verify`. A verified webhook (`POST /api/payments/webhook`, raw body, signature checked with `RAZORPAY_WEBHOOK_SECRET`) is processed idempotently. Frontend payment flags are never trusted. Without `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`, online endpoints return a clear `503` and the UI offers wallet or pay-at-counter.
- **Cash counter** — owners record counter sales at `/owner/cash`, collecting cash immediately and issuing a token. Guest QR orders are created as cash-pending and are marked paid at the counter.
- **Revenue** — reports in `/admin/revenue` and `/owner/revenue` separate **cash**, **online** and **wallet** totals, list daily revenue, top items, operating sessions and (for admins) revenue per canteen. Only paid, non-cancelled orders count. Financial records are never deleted.

## Guest QR ordering

Each canteen has a public guest page at `/qr/<canteen-code>`. Owners download the QR image from **Canteen setup** and place it on tables or the counter. Guests can browse the branded menu and place a cash order **without registering**; they receive a token and can track status with the order link and the phone number used at checkout. The public API is unauthenticated but validates the canteen code, session state, stock and prices server-side.

## Receipts and thermal printing

Order screens and the cash counter include a **Token receipt** dialog. It renders an 80 mm thermal-friendly layout and calls the browser print dialog (`window.print()`), with dedicated `@media print` CSS that hides the app and prints only the receipt. Choose an 80 mm paper preset in the printer driver for Epson TM-series printers.

Browser printing is the supported baseline. Direct Epson/ESC-POS printing requires a local print bridge or vendor SDK plus the printer's USB/network address; set that up outside the web app and keep the browser receipt as the fallback. See `docs/PRINTING.md` for the approach.

## Database

The API uses MongoDB through Mongoose:

- If `MONGODB_URI` is set (for example MongoDB Atlas), that cluster is used.
- If it is empty or unreachable, the server starts `mongodb-memory-server` with a persistent on-disk store in `server/.data`. Data survives restarts but lives on that machine only.
- The embedded store picks the newest cached `mongod` binary when opening an existing data directory, so version upgrades do not lock the data out.

Uploaded images are stored on disk, never in MongoDB.

"# FoodFlow" 
