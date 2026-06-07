# Sprig — Quick Commerce API

Production-oriented backend foundation for a Blinkit/Zepto-style quick-commerce
platform. Express + TypeScript + Prisma (PostgreSQL) + Socket.io, with JWT auth
(access + rotating refresh tokens), RBAC for five roles, Zod validation, rate
limiting, structured logging, Swagger docs, and Docker.

> This is a **runnable foundation + one deep vertical slice** (browse → cart →
> atomic checkout → payment intent → live order tracking), not every endpoint in
> the spec. It is built so the remaining modules follow the same module pattern.

## Quick start

### Option A — Docker (DB + Redis + API)
```bash
cp .env.example .env          # adjust secrets
docker compose up --build
# API: http://localhost:4000  ·  Swagger: http://localhost:4000/docs
```

### Option B — Local
```bash
npm install
cp .env.example .env          # set DATABASE_URL + JWT secrets
npx prisma migrate dev        # create the schema
npm run db:seed               # demo store, products, users, coupon
npm run dev
```

Seeded logins (password `Password123`): `owner@sprig.dev`, `customer@sprig.dev`,
`rider@sprig.dev`.

## Project structure
```
src/
  config/env.ts          Zod-validated, fail-fast env
  lib/                   prisma · jwt · logger · redis singletons
  middleware/            auth · rbac · validate · rateLimit · error
  modules/
    auth/                register · login · OTP · refresh-rotation · me
    products/            list (filter/sort/paginate) · detail
    cart/                single-store cart, add/update/remove/clear
    orders/              atomic checkout, status transitions, history
    payments/            Razorpay/Stripe intent + signed webhooks
  realtime/socket.ts     Socket.io rooms + emit helpers
  docs/swagger.ts        OpenAPI at /docs
  routes.ts · app.ts · index.ts
prisma/schema.prisma     full data model (30+ models)
prisma/seed.ts
```

## Key endpoints (`/api/v1`)
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` · `/auth/login` | email + password |
| POST | `/auth/otp/request` · `/auth/otp/verify` | phone OTP (dev returns the code) |
| POST | `/auth/refresh` · `/auth/logout` | rotating refresh tokens |
| GET | `/products` | `?q=&categoryId=&minPrice=&sort=&page=` |
| GET/POST/PATCH/DELETE | `/cart` `/cart/items[/:id]` | customer cart |
| POST | `/orders` | atomic checkout from cart |
| GET | `/orders` `/orders/:id` | scoped by role |
| PATCH | `/orders/:id/status` | store/rider/staff; emits realtime update |
| POST | `/payments/intent` | create provider intent |
| POST | `/payments/webhook/{razorpay,stripe}` | signature-verified |

## Realtime (Socket.io)
Connect with `auth: { token: <accessToken> }`. Emit `order:subscribe` /
`store:subscribe` to join rooms. Server pushes `order:new`, `order:update`,
`partner:location`.

## Notes
- **Money:** floats are used for readability; switch to integer paise end-to-end
  before production.
- **Payments:** SDK calls are stubbed with TODOs and return test-mode payloads
  when keys are absent, so the client can integrate before going live.
- **Geo:** lat/lng are plain floats. For radius/geofence queries enable PostGIS
  (see ARCHITECTURE.md).
- **Scaling Socket.io:** `npm i @socket.io/redis-adapter` and set `REDIS_URL`.
