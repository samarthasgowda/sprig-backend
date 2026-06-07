# 🌱 Sprig — Quick Commerce API

A production-oriented backend for a **Blinkit / Zepto / Swiggy Instamart**–style
quick-commerce platform — groceries delivered in minutes. Built with Express,
TypeScript, Prisma and PostgreSQL, with JWT auth, role-based access for five
user types, real-time order tracking over WebSockets, payment integration, and
a Docker-ready setup.

![Node](https://img.shields.io/badge/Node-20_LTS-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.19-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

> **Scope:** This is a runnable **foundation + one deep vertical slice** —
> browse → cart → atomic checkout → payment intent → live order tracking — built
> so the remaining modules follow the same pattern. It is not every endpoint in
> a full commercial app.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [API reference](#api-reference)
- [Real-time events](#real-time-events)
- [Environment variables](#environment-variables)
- [Production & scaling](#production--scaling)
- [Deployment](#deployment)
- [Links](#links)
- [License](#license)

---

## Features

- **Auth** — email + password, phone OTP, JWT access tokens with **rotating,
  hashed, revocable refresh tokens**.
- **RBAC** — five roles: `CUSTOMER`, `STORE_OWNER`, `DELIVERY_PARTNER`, `ADMIN`,
  `SUPPORT`.
- **Catalog** — categories (with sub-categories), products, variants, and
  per-store inventory; filtering, sorting and pagination.
- **Cart** — single-store cart with add / update / remove / clear.
- **Atomic checkout** — stock validation, totals (delivery + handling + 5% GST),
  coupon logic and stock decrement all inside one DB transaction, so the system
  never oversells.
- **Payments** — Razorpay / Stripe payment-intent creation and
  **signature-verified webhooks** (test-mode payloads when keys are absent).
- **Real-time** — Socket.io order tracking (`order:new`, `order:update`,
  `partner:location`).
- **Hardening** — Zod validation, rate limiting, Helmet, CORS, structured
  logging (pino), centralized error handling.
- **DX** — Swagger UI at `/docs`, Prisma Studio, seed script, Docker Compose.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | [Node.js 20](https://nodejs.org) · [TypeScript](https://www.typescriptlang.org) |
| Web framework | [Express](https://expressjs.com) |
| ORM / DB | [Prisma](https://www.prisma.io) · [PostgreSQL](https://www.postgresql.org) |
| Auth | [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) · [bcryptjs](https://github.com/dcodeIO/bcrypt.js) |
| Validation | [Zod](https://zod.dev) |
| Real-time | [Socket.io](https://socket.io) (+ optional [Redis](https://redis.io) adapter) |
| Docs | [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) · [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) |
| Logging | [pino](https://getpino.io) |
| Container | [Docker](https://www.docker.com) |

---

## Architecture

Stateless API instances behind a load balancer; all state lives in Postgres and
Redis so the API scales horizontally. Slow side effects (notifications, partner
assignment, payouts) are pushed onto a queue and handled by workers.

```
                         ┌──────────────────────────────────────────┐
   Customer / Store /     │                  CDN (CloudFront)         │  static + media
   Rider / Admin apps  ──▶│            ALB / API Gateway (HTTPS)       │
   (Next.js, RN)          └───────────────┬───────────────┬──────────┘
                                          │ REST          │ WebSocket
                              ┌───────────▼───────┐  ┌─────▼───────────┐
                              │  API instances     │  │ Socket.io nodes │
                              │ (Express, N pods)   │  │ (N pods)        │
                              └───┬───────┬─────┬──┘  └────────┬────────┘
                                  │       │     │              │ Redis adapter
                  ┌───────────────▼─┐  ┌──▼───┐ │      ┌───────▼────────┐
                  │ PostgreSQL       │  │ Redis│ │      │ Redis pub/sub  │
                  │ primary+replicas │  │ cache│ │      └────────────────┘
                  │ (via PgBouncer)  │  └──────┘ │
                  └──────────────────┘           │ enqueue
                                          ┌───────▼────────┐
                                          │ Queue (BullMQ / │
                                          │ SQS)            │
                                          └───────┬────────┘
                                          ┌───────▼────────┐   ┌──────────────────────┐
                                          │ Workers         │──▶│ FCM · SMS · Email     │
                                          │ (notifications, │   │ Payments · Maps · S3  │
                                          │ assignment)     │   └──────────────────────┘
                                          └─────────────────┘
```

```mermaid
flowchart LR
  C[Clients] --> ALB[ALB / Gateway]
  ALB -->|REST| API[Express API pods]
  ALB -->|WS| WS[Socket.io pods]
  API --> PG[(Postgres primary + replicas)]
  API --> R[(Redis cache)]
  API --> Q[[Queue]]
  WS --- RP[(Redis pub/sub)]
  Q --> W[Workers]
  W --> EXT[FCM / SMS / Email / Payments / Maps / S3]
  API --> EXT
```

### Component responsibilities

- **API** — request validation, authentication, business rules, transactional
  writes. The source of truth for behaviour.
- **Socket.io nodes** — real-time fan-out only; read auth from the JWT in the
  handshake and join rooms.
- **PostgreSQL** — system of record; read replicas absorb heavy read traffic.
- **Redis** — cache + the Socket.io adapter backbone.
- **Workers** — every side effect that can happen *after* the user response.

### Order placement (atomic)

```
POST /orders
  └─ prisma.$transaction:
       1. load cart + items (+ variants)
       2. load inventory for (store, variants); reject if any short  → 409
       3. compute itemTotal, coupon discount, delivery + handling + 5% GST
       4. decrement inventory.stock for each line
       5. create Order + OrderItems + initial StatusEvent + Payment(PENDING)
       6. record coupon redemption; empty the cart
  └─ emit "order:new" → store:{id} room   (after commit)
```

The stock check and decrement run in the same transaction, so two simultaneous
checkouts can't both buy the last item. The `Inventory.reserved` column is in
place for a hold/release reservation model under heavy contention.

### Real-time tracking

The client opens a socket with `auth: { token }` and emits
`order:subscribe(orderId)`. When the store or rider calls
`PATCH /orders/:id/status`, the API writes an `OrderStatusEvent` and emits
`order:update` to the order room and the customer's `user:{id}` room. The rider
app streams `partner:location`, relayed live to the order room for the map.

### Payments

`POST /payments/intent` creates a provider intent and stores its id on the
`Payment` row. The provider later calls `POST /payments/webhook/{razorpay|stripe}`;
the signature is **verified over the raw body** before the `Payment` is marked
`PAID`. Card data never touches the server (PCI scope stays with the provider),
and webhook handlers are idempotent.

---

## Data model

Full definition in [`prisma/schema.prisma`](prisma/schema.prisma) — 30+ models.
Core relationships:

```mermaid
erDiagram
  User ||--o| Cart : has
  User ||--o{ Address : has
  User ||--o| Store : owns
  User ||--o| DeliveryPartner : "is"
  Store ||--o{ Inventory : stocks
  Product ||--o{ ProductVariant : has
  ProductVariant ||--o{ Inventory : "stocked as"
  Cart ||--o{ CartItem : contains
  ProductVariant ||--o{ CartItem : "in"
  User ||--o{ Order : places
  Store ||--o{ Order : fulfils
  Order ||--o{ OrderItem : contains
  Order ||--o| Payment : "paid by"
  Order ||--o{ OrderStatusEvent : "tracked by"
  DeliveryPartner ||--o{ Order : delivers
```

Money is `Decimal(10,2)`, every customer gets a `Wallet`, orders snapshot the
delivery address and item names, reviews are polymorphic (product / store /
partner), and indexes cover every foreign key plus hot filters.

---

## Project structure

```
src/
  config/env.ts          Zod-validated, fail-fast environment
  lib/                   prisma · jwt · logger · redis singletons
  middleware/            auth · rbac · validate · rateLimit · error
  modules/
    auth/                register · login · OTP · refresh-rotation · me
    products/            list (filter/sort/paginate) · detail
    cart/                single-store cart
    orders/              atomic checkout · status transitions · history
    payments/            Razorpay/Stripe intent + signed webhooks
  realtime/socket.ts     Socket.io rooms + emit helpers
  docs/swagger.ts        OpenAPI at /docs
  routes.ts · app.ts · index.ts
prisma/
  schema.prisma          data model (30+ models)
  seed.ts                demo store, products, users, coupon
Dockerfile · docker-compose.yml
```

---

## Getting started

### Prerequisites

- **Node.js 20 LTS** — verify with `node -v`
- **PostgreSQL 14+** — choose one option below
- (optional) **Redis** — only for multi-instance Socket.io scaling

### 1. Install dependencies

```bash
npm install
```

### 2. Start a PostgreSQL database

Pick whichever is easiest for you:

**Option A — Postgres.app (macOS, no Docker, recommended for M1):**
Download [Postgres.app](https://postgresapp.com), open it, click **Initialize**.
It runs on `localhost:5432` with a superuser matching your macOS username and no
password.

**Option B — Neon (free cloud, zero install):**
Create a database at [neon.tech](https://neon.tech) and copy the connection
string it gives you into `DATABASE_URL`.

**Option C — Docker:**
```bash
docker compose up -d postgres redis
```
Runs Postgres (`sprig` / `sprig` / `sprig`) and Redis locally.

### 3. Configure environment

```bash
cp .env.example .env
```

Generate two secrets (run twice, paste each):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set these in `.env`:
```env
# Postgres.app (replace with your macOS username):
DATABASE_URL=postgresql://<your-mac-username>@localhost:5432/sprig?schema=public
# Docker option instead:
# DATABASE_URL=postgresql://sprig:sprig@localhost:5432/sprig?schema=public
# Neon option instead:
# DATABASE_URL=postgresql://user:pass@your-neon-host/neondb?sslmode=require

JWT_ACCESS_SECRET=<first generated string>
JWT_REFRESH_SECRET=<second generated string>

# Optional — comment out if you are not running Redis:
# REDIS_URL=redis://localhost:6379
```

### 4. Create tables + seed demo data

```bash
npx prisma migrate dev --name init
npm run db:seed
```

Seeded logins (password `Password123`): `owner@sprig.dev`,
`customer@sprig.dev`, `rider@sprig.dev`.

### 5. Run the server

```bash
npm run dev
```

Visit **http://localhost:4000/docs** for the interactive API. The server runs on
port `4000` (change `PORT` in `.env`).

### Quick smoke test

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@sprig.dev","password":"Password123"}'
```

---

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run prisma:migrate` | Create / apply a dev migration |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run db:seed` | Load demo data |
| `npm run typecheck` | Type-check without emitting |
| `npx prisma studio` | Visual DB browser at `localhost:5555` |

---

## API reference

Base URL: `http://localhost:4000/api/v1` · full interactive docs at `/docs`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | – | email + password |
| POST | `/auth/login` | – | returns access + refresh tokens |
| POST | `/auth/otp/request` | – | phone OTP (dev returns the code) |
| POST | `/auth/otp/verify` | – | verify OTP, log in / sign up |
| POST | `/auth/refresh` | – | rotate refresh token |
| POST | `/auth/logout` | – | revoke refresh token |
| GET | `/auth/me` | ✓ | current user + wallet |
| GET | `/products` | – | `?q=&categoryId=&minPrice=&sort=&page=` |
| GET | `/products/:id` | – | product detail |
| GET | `/cart` | customer | current cart |
| POST | `/cart/items` | customer | add item |
| PATCH | `/cart/items/:id` | customer | update quantity |
| DELETE | `/cart/items/:id` | customer | remove item |
| DELETE | `/cart` | customer | clear cart |
| POST | `/orders` | customer | atomic checkout from cart |
| GET | `/orders` | ✓ | scoped by role |
| GET | `/orders/:id` | ✓ | order detail + tracking |
| PATCH | `/orders/:id/status` | store/rider/staff | emits real-time update |
| POST | `/payments/intent` | ✓ | create provider intent |
| POST | `/payments/webhook/razorpay` | – | signature-verified |
| POST | `/payments/webhook/stripe` | – | signature-verified |

Send `Authorization: Bearer <accessToken>` on protected routes.

---

## Real-time events

Connect with `auth: { token: <accessToken> }`. Client emits:
`order:subscribe(orderId)`, `store:subscribe(storeId)`, `partner:location({orderId,lat,lng})`.
Server emits: `order:new`, `order:update`, `partner:location`.

For multi-instance deployments: `npm i @socket.io/redis-adapter` and set
`REDIS_URL`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | – | `development` / `production` |
| `PORT` | – | API port (default 4000) |
| `CLIENT_URL` | – | allowed CORS origin |
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `REDIS_URL` | – | enables cache + Socket.io adapter |
| `JWT_ACCESS_SECRET` | ✓ | min 16 chars |
| `JWT_REFRESH_SECRET` | ✓ | min 16 chars |
| `ACCESS_TOKEN_TTL` | – | e.g. `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | – | e.g. `30` |
| `RAZORPAY_KEY_ID` / `_SECRET` / `_WEBHOOK_SECRET` | – | Razorpay |
| `STRIPE_SECRET_KEY` / `_WEBHOOK_SECRET` | – | Stripe |
| `AWS_*` | – | S3 storage |
| `FCM_SERVER_KEY` | – | push notifications |

---

## Production & scaling

To reach ~1M users / 100k+ orders a day:

- **Horizontal API scale** — N stateless pods behind the load balancer.
- **Database** — PgBouncer connection pooling, read replicas for reads, partition
  high-growth tables (`Order`, `OrderStatusEvent`, `Notification`).
- **Caching** — Redis for catalog/product reads (short TTL + invalidate on write).
- **Search** — move product search to Meilisearch / OpenSearch at scale.
- **Async** — push notifications, partner assignment and payouts to BullMQ / SQS
  workers.
- **Real-time** — Socket.io Redis adapter + sticky sessions for the WS upgrade.
- **Edge** — CloudFront for media and web bundles.
- **Safety** — rate limiting (in place) + idempotency keys on orders/webhooks.
- **Geo** — enable PostGIS (`geography` column + GiST index) for store coverage
  and nearest-rider matching.

---

## Deployment

- **Images** — multi-stage `Dockerfile` (build → slim `node:20-alpine` runtime);
  `prisma generate` at build, `prisma migrate deploy` on start.
- **CI/CD** — `install → lint → typecheck → test → migrate deploy → build & push
  → deploy → smoke test`.
- **AWS target** — ECS Fargate (or EKS) for API / Socket.io / workers · RDS
  Postgres (Multi-AZ) + PgBouncer · ElastiCache Redis · S3 + CloudFront · ALB
  with sticky sessions.
- **Backups & DR** — RDS automated backups + point-in-time recovery, cross-region
  snapshots, Multi-AZ failover.

---

## Links

**Local development**
- API base — http://localhost:4000/api/v1
- Health check — http://localhost:4000/health
- Swagger / API docs — http://localhost:4000/docs
- OpenAPI JSON — http://localhost:4000/openapi.json
- Prisma Studio — http://localhost:5555 (after `npx prisma studio`)

**Deployment** _(fill in once deployed)_
- Live API — `https://<your-deployment-url>`
- Repository — `https://github.com/<your-username>/sprig-backend`

---

## License

MIT — see `LICENSE`. Built as a reference quick-commerce backend.
