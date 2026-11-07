# Emotiq

Emotiq is an AI-powered emotional support graduation project. The backend uses Express 5, JavaScript ES Modules, Prisma ORM 7, and an existing Neon PostgreSQL database. Authentication, booking, sessions, AI chat, mood tracking, and journals are implemented. The frontend is unchanged.

## Setup

Use a supported Node.js LTS release: Node 22.12+ or Node 24.x is recommended. Prisma 7.10.1 declares Node `^20.19 || ^22.12 || >=24.0`; the local Node 25.6.1 installation meets that requirement.

From the repository root, on a fresh clone only:

```sh
cp .env.example .env
```

Fill in the existing Neon database credentials in the root `.env`. Keep existing local values when updating this project.

- `PORT`: HTTP port, default `4000`.
- `NODE_ENV`: `development`, `test`, or `production`.
- `DATABASE_URL`: Neon pooled connection string, with `-pooler` in its hostname, for runtime queries.
- `DIRECT_URL`: direct connection string for the same Neon database, for migrations and Studio.

Both Prisma config and the application load the root `.env` independently of the working directory. Already exported environment variables take precedence. SSL certificate and hostname verification are enforced with `sslmode=verify-full`; runtime also enables channel binding. Certificate validation is never disabled. `.env`, generated clients under `node_modules`, and dependency folders are ignored by Git. `.env.example` contains placeholders only.

```sh
cd backend
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

Use `npm start` for startup without automatic restarts. Default address: `http://localhost:4000`.

## Database and migrations

`backend/prisma/schema.prisma` defines seven models, with UUID primary keys, snake_case tables and columns, timestamptz timestamps, explicit foreign keys, and query indexes:

| Model | Table | Relationships |
| --- | --- | --- |
| User | users | Has bookings, sessions, mood entries, journal entries, refresh tokens |
| Booking | bookings | Belongs to a user; has zero or one session |
| Session | sessions | Belongs to a user and one unique booking; has messages |
| Message | messages | Belongs to a session |
| MoodEntry | mood_entries | Belongs to a user |
| JournalEntry | journal_entries | Belongs to a user |
| RefreshToken | refresh_tokens | Belongs to a user; stores a token hash |

All foreign keys use `ON DELETE RESTRICT` to prevent accidental cascading deletion of sensitive records. The initial SQL migration additionally checks that mood scores are between 1 and 5 and that booking end times follow start times. Preserve these custom checks in future migrations. Future services must ensure a session's user matches its booking's user.

`backend/prisma.config.ts` is the only TypeScript configuration file; application code remains JavaScript. It points migration tooling to `DIRECT_URL`. The supported `prisma-client-js` generator emits runnable JavaScript consumed via `@prisma/client`; the modern `prisma-client` generator emits TypeScript and would require an additional compilation/runtime transform step. See [Prisma generator documentation](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators).

`backend/src/config/prisma.js` exports one shared Prisma Client using the official `@prisma/adapter-pg` adapter, the pooled `DATABASE_URL`, a 10-second connection timeout, and a pool limit of 10. Import this shared instance in future services. The HTTP server drains connections and disconnects Prisma on SIGINT/SIGTERM, with a 10-second shutdown deadline.

Run Prisma commands from `backend/`:

```sh
npm run prisma:generate                 # Regenerate after schema changes
npm run prisma:migrate -- --name change # Create/apply a development migration
npm run prisma:deploy                   # Apply committed migrations
npm run prisma:studio                   # Browse the configured database locally
npx prisma validate
npx prisma migrate status
```

Inspect the target database and review generated SQL before applying migrations. Use an isolated development database for `migrate dev`, which uses a shadow database. Never accept a reset on a database whose data must be retained. Use `migrate deploy` to apply reviewed migrations to shared databases. Do not use `db push` as schema history.

The initial migration is `20261024000100_init`. The target Neon database was inspected and had no user tables before applying it; no existing tables were reset or dropped.

## Health endpoints

```sh
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/db
```

`GET /api/health` retains its existing HTTP 200 response:

```json
{"success": true, "message": "Emotiq API is running"}
```

`GET /api/health/db` runs `SELECT 1` through Prisma. Success returns HTTP 200:

```json
{"success": true, "message": "Neon PostgreSQL connected successfully"}
```

Database failures return HTTP 503 with `{"success":false,"message":"Database connection unavailable"}`. Responses never include database errors, credentials, or stack traces.

## Backend organization

- `backend/prisma/`: database schema and versioned SQL migrations.
- `backend/prisma.config.ts`: direct database connection for Prisma CLI.
- `backend/src/config/`: environment loading and reusable Prisma Client.
- `backend/src/controllers/` and `backend/src/routes/`: existing health endpoint and database health endpoint.
- `backend/src/middlewares/`: existing error and not-found handlers.
- `backend/src/app.js`: Express configuration; `backend/src/server.js`: HTTP listener and shutdown.

Existing routes and the root Hello World response are preserved. Authentication, booking, session, and chat routes are implemented. Mood and journal routes support owner-scoped CRUD.

## Integration verification

Verified during setup: Prisma schema validation and JavaScript client generation; successful initial migration and up-to-date migration status; all seven application tables and both SQL CHECK constraints; live HTTP 200 responses from both health endpoints; a simulated database failure returning the safe HTTP 503 response; and server startup followed by graceful SIGTERM shutdown. Dependency installation reported zero known vulnerabilities.

## Authentication API

Authentication uses Argon2id passwords (64 MiB memory, three iterations), HS256 access JWTs lasting 15 minutes, and random 256-bit refresh tokens lasting seven days. PostgreSQL stores only refresh-token SHA-256 hashes. Registration does not log the user in. Responses select only user `id`, `name`, and `email`.

Required authentication configuration in the root `.env`:

```ini
JWT_ACCESS_SECRET=replace_with_strong_random_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_ISSUER=emotiq-api
JWT_AUDIENCE=emotiq-client
REFRESH_TOKEN_EXPIRES_DAYS=7
FRONTEND_URL=http://localhost:5173
```

A random secret was generated for the existing local `.env`. For a fresh installation generate your own secret with:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set that output as `JWT_ACCESS_SECRET`. Startup validates configuration and requires at least 32 secret characters, an exact frontend origin (no path), a 15-minute access lifetime and a seven-day refresh lifetime. Production requires an HTTPS `FRONTEND_URL`. Preserve `PORT`, `NODE_ENV`, `DATABASE_URL`, and `DIRECT_URL`. Do not expose the secret to the frontend. Changing it invalidates existing access JWT signatures.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| POST | `/api/auth/register` | Strict name/email/password validation; HTTP 201 safe user, 409 duplicate |
| POST | `/api/auth/login` | HTTP 200 safe user, `accessToken`, `expiresIn: 900`; sets refresh cookie |
| GET | `/api/auth/me` | Bearer JWT required; HTTP 200 safe profile |
| POST | `/api/auth/refresh` | Rotates refresh cookie; HTTP 200 new `accessToken` and `expiresIn` |
| POST | `/api/auth/logout` | Revokes cookie token, clears cookie, HTTP 204 empty body |

Every auth POST requires **both** an allowed `Origin` and `X-CSRF-Protection: 1`, including curl/Postman requests. `FRONTEND_URL` is always allowed; development also permits exactly `http://localhost:PORT` (the configured backend port) for local Swagger UI. Production permits only `FRONTEND_URL`. This protects cookie endpoints and prevents login CSRF independently of CORS. Browsers send Origin automatically. CORS permits credentials and the custom header for the allowed origins above. Frontend requests must use `credentials: 'include'` (or Axios `withCredentials: true`) for login, refresh, and logout. Keep access tokens in memory and send them in the `Authorization` header to protected endpoints.

Refresh cookies are HttpOnly, SameSite=Lax, scoped to `/api/auth`, expire after seven days, and are Secure in production. Use same-site frontend/API hosting in production, for example `app.example.com` and `api.example.com`, with HTTPS. Truly cross-site hosting requires an explicit cookie/CSRF deployment design; the current Lax cookie does not support that layout. Avoid mixing `localhost` and `127.0.0.1` while developing.

Rotation uses an interactive Prisma transaction and a conditional UPDATE on the old token's ID, expiration, and unrevoked state. PostgreSQL locks the row and rechecks the condition after a competing transaction commits, so only one refresh succeeds. A failed replacement insert rolls back revocation. Reused, expired, revoked, malformed, and missing refresh tokens return 401. The frontend should coordinate concurrent refresh calls into one request. Reuse is rejected; there is no token-family revocation mechanism in the existing schema.

Logout is idempotent. Existing access JWTs remain usable until their 15-minute expiration. Revoked and expired refresh rows are retained; add a retention policy before long-term production use.

### Example requests

Register (does not set an authentication cookie):

```sh
curl -X POST http://localhost:4000/api/auth/register \
  -H 'Origin: http://localhost:5173' \
  -H 'X-CSRF-Protection: 1' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Levon","email":"levon@example.com","password":"StrongPassword123!"}'
```

Login and save the HttpOnly cookie locally (keep the cookie file private):

```sh
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Origin: http://localhost:5173' \
  -H 'X-CSRF-Protection: 1' \
  -H 'Content-Type: application/json' \
  -c /tmp/emotiq-cookies.txt \
  -d '{"email":"levon@example.com","password":"StrongPassword123!"}'
```

Use the returned access token for your profile:

```sh
curl http://localhost:4000/api/auth/me \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

Refresh and update the saved cookie, then logout:

```sh
curl -X POST http://localhost:4000/api/auth/refresh \
  -H 'Origin: http://localhost:5173' \
  -H 'X-CSRF-Protection: 1' \
  -b /tmp/emotiq-cookies.txt -c /tmp/emotiq-cookies.txt

curl -X POST http://localhost:4000/api/auth/logout \
  -H 'Origin: http://localhost:5173' \
  -H 'X-CSRF-Protection: 1' \
  -b /tmp/emotiq-cookies.txt -c /tmp/emotiq-cookies.txt
```

Validation errors return HTTP 400 with `{success:false,message:"Validation failed",errors:[{field,message}]}`. Unexpected fields are rejected. Passwords are never trimmed or normalized. Invalid credentials return a generic 401; CSRF failures return 403; rate limits return 429 with retry headers; internal failures return a generic 500. Error objects, request bodies, authorization headers, cookies, and query strings are not logged by the application.

### Rate limits and deployment

Per client IP, per 15 minutes: register 10, login 20, refresh 60, logout 60, profile 120. Limits include failed attempts and use the default in-memory store, appropriate for local/single-process development. Use a shared rate-limit store for multiple replicas. Proxy trust is disabled. Before deploying behind a proxy, configure only the actual trusted proxy IPs/CIDRs in `app.js`, ensure the proxy overwrites forwarding headers, and verify client IP detection; do not enable unrestricted proxy trust.

### Authentication tests

```sh
cd backend
npm test
```

Tests use Node's test runner, Supertest, real Argon2/JWT utilities, and an injected in-memory Prisma mock; no real Neon data is written or deleted. They cover registration, validation, duplicate conflicts, hashing, login failures, JWT verification, protected profiles, rotation/reuse/expiry, competing refresh reads, transaction rollback, logout, CSRF, cookies, rate limits, configuration validation, and existing health endpoints. Concurrency behavior is simulated by the mock; production PostgreSQL locking is not exercised by this suite.

Dependencies are pinned in `package-lock.json`. Argon2 uses a native module. On this Intel macOS installation its source build needed the existing SDK's C++ headers; if a fresh `npm ci` reports a missing `functional` header, use:

```sh
CPLUS_INCLUDE_PATH=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 npm ci
```

Authentication adds no Prisma schema changes: `User.email` is already unique and `RefreshToken.tokenHash` already has an index. Existing models, relationships, and database data are preserved.

### Register and login with Postman

1. Start the backend with `cd backend && npm run dev`.
2. Create a POST request to `http://localhost:4000/api/auth/register`.
3. Set headers `Content-Type: application/json`, `Origin: http://localhost:5173`, and `X-CSRF-Protection: 1`. Use your actual configured frontend origin if different.
4. Select **Body → raw → JSON** and send:

```json
{"name":"Levon","email":"levon@example.com","password":"StrongPassword123!"}
```

Expect HTTP 201, message `User registered successfully`, and only the user's `id`, `name`, and normalized `email`. Registration does not log in or set a refresh cookie. Repeating registration returns 409.

5. Create a POST request to `http://localhost:4000/api/auth/login`, with the same headers, and send:

```json
{"email":"levon@example.com","password":"StrongPassword123!"}
```

Expect HTTP 200, message `Login successful`, a safe user profile, `accessToken`, and `expiresIn: 900`. Postman's cookie manager stores the `emotiq_refresh` HttpOnly cookie; the refresh token never appears in JSON. Unknown emails and wrong passwords both return the same 401 response. Invalid input returns 400, missing/incorrect CSRF headers return 403, and rate-limited requests return 429.

These manual successful requests create a real user and hashed refresh-token record in the configured database. Automated tests instead use mocks and never modify Neon data.

## Complete authentication flow verification

Import [the Postman collection](backend/postman/Emotiq_Auth.postman_collection.json) and follow [the collection instructions](backend/postman/README.md). It includes the six-step flow, automatic access-token capture, cookie reuse, and negative cases. The collection defaults to port 5000; the regular backend defaults to 4000. Use an isolated database for collection runs that create accounts.

`npm test` in `backend/` runs mocked API tests, a complete cookie-aware authentication flow, collection script/request verification, and a development-log redaction check. These tests do not create users or delete records in Neon.

## Booking and calendar API

All `/api/bookings` endpoints require `Authorization: Bearer <accessToken>`. They use bearer authentication only; the refresh cookie does not authenticate booking requests. Registration/login/refresh/logout retain their existing CSRF requirements.

| Method | URL | Result |
| --- | --- | --- |
| GET | `/api/bookings/availability?date=2026-10-26&timezone=Asia/Yerevan` | Calendar slots, remaining places and whether you already booked |
| POST | `/api/bookings` | Create a booking; HTTP 201 |
| GET | `/api/bookings?page=1&limit=20&status=SCHEDULED` | Your bookings and pagination (status optional) |
| GET | `/api/bookings/:id` | Your booking; other users' IDs return 404 |
| PATCH | `/api/bookings/:id/cancel` | Cancel your upcoming booking; repeated cancellation succeeds |

Initial scheduling policy: 24/7, 30-minute slots starting at UTC `:00` or `:30`, maximum **3 users per slot**, bookings up to 90 days ahead. Availability omits past slot starts. The timezone defaults to `Asia/Yerevan`; supply an IANA timezone to select the user's local calendar day. Responses contain ISO UTC timestamps; render those in the user's timezone on the future frontend. UTC slot boundaries can appear at different local minutes in timezones whose offset is not a multiple of 30 minutes. Daylight-saving dates use the actual day length, rather than assuming every day has 24 hours.

Only `startTime` is accepted when booking; the server computes `endTime`, sets `SCHEDULED`, and takes user ID from the verified JWT. Do not send userId, endTime or status. Copy a slot's `startTime` from availability:

```sh
curl -X POST http://localhost:4000/api/bookings \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"startTime":"2026-10-26T10:00:00.000Z"}'
```

Use a future timestamp within 90 days when running this example. In Postman, choose Bearer Token authorization and use Body → raw → JSON with the same body. Cancellation needs no body:

```sh
curl -X PATCH http://localhost:4000/api/bookings/BOOKING_UUID/cancel \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

Availability returns `{success:true,data:{date,timezone,slotDurationMinutes:30,slots:[...]}}`. Each slot has `startTime`, `endTime`, `capacity:3`, `remainingPlaces`, `bookedByYou`, and `available`. A full slot or one you already booked is unavailable; no other user's identifiers are returned. Availability is a snapshot, not a reservation. POST rechecks capacity and personal overlap atomically.

Creation uses PostgreSQL Serializable transactions with up to four attempts on Prisma P2034 conflicts, following [Prisma's transaction guidance](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions). This prevents concurrent inserts exceeding capacity through this service. Every future booking write path must use the same transaction policy; direct SQL/Studio writes bypass application rules. Existing non-cancelled overlapping bookings count toward capacity. Cancellation frees a place, but started/completed/missed bookings and bookings already linked to a session cannot be cancelled. Sessions are started explicitly through the sessions API; no background missed/completed status scheduler is implemented.

Validation failures return 400, missing/invalid authentication 401, missing/other-user bookings 404, full/duplicate/unavailable booking conflicts 409, and rate limits 429. There is a per-IP limit of 180 booking requests per 15 minutes. Limits use the existing in-memory deployment approach. PATCH is enabled in credentialed CORS for the configured frontend origin.

No schema migration is required; the existing Booking model and indexes are reused. Booking tests use injected database mocks, including simulated serial schedules and serialization-conflict retries; actual PostgreSQL concurrent locking requires a separate isolated database integration test. No test booking records are written to the normal Neon database. Run all tests from `backend/` with `npm test`.


## Sessions and AI chat API

All session endpoints require a Bearer access token. Each booking has at most one session, owned by its booking owner. No schema migration is needed.

| Method | Endpoint | Body / behavior |
| --- | --- | --- |
| POST | `/api/sessions` | `{"bookingId":"BOOKING_UUID"}` starts a session; repeat while active returns the same session |
| GET | `/api/sessions?page=1&limit=20` | Your sessions, newest first |
| GET | `/api/sessions/:id` | Your session; lazily persists expiry |
| GET | `/api/sessions/:id/messages?page=1&limit=20` | Chronological user/assistant messages |
| POST | `/api/sessions/:id/messages` | `{"content":"Today I feel anxious"}`; HTTP 201 with `userMessage` and `assistantMessage` |
| PATCH | `/api/sessions/:id/complete` | Ends the session and completes its booking; repeat succeeds |

Start and message requests are allowed only for scheduled bookings during `[startTime, endTime)`. Ending early is allowed. Ended sessions cannot be reopened. Access to another user's session returns 404. Reads of an expired session mark it EXPIRED and its booking COMPLETED; completion after the deadline does the same. There is no background expiry job: listing may show stored ACTIVE status until that session is fetched or completed, but message writes always enforce the deadline.

Configure the API key (and optionally override the default model) in the root `.env` and restart the backend to enable real AI replies:

```ini
GEMINI_API_KEY=your_private_google_ai_studio_key
GEMINI_MODEL=gemini-3.8-flash
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). The default model is `gemini-3.8-flash`; `GEMINI_MODEL` can override it with another Gemini text model supporting generateContent. Access and free-tier quotas depend on your project and model. Missing API key returns 503 on message sends; session creation and history remain available. No API key is sent to the browser. The adapter uses Google's [generateContent API](https://ai.google.dev/api/generate-content), sends the key only in the `x-goog-api-key` header, and includes explicit history with user/model roles and separate system instructions. OpenAI configuration is no longer used.

Conversation text is sent to Google when sending a message. Google's [free-tier terms](https://ai.google.dev/gemini-api/docs/pricing) indicate content may be used to improve products; use fictional conversations for development. Automated tests mock the provider and never make real AI requests. Quota exhaustion returns a generic 503; other upstream failures, blocked, incomplete, or empty responses return 502 without storing a partial turn. The application does not retry provider requests automatically.

The assistant is instructed to provide emotional support in the user's language, avoid diagnosis or medication advice, and encourage immediate human help when there is immediate danger. These instructions are not a clinically validated crisis detection system. No automatic summaries are generated.

Messages are limited to 4,000 characters; each session permits 50 successful exchanges (100 stored messages). The provider has a configurable timeout (`GEMINI_TIMEOUT_MS`, default 60 seconds) and a 4,096-output-token budget (including model thinking where applicable). Provider failures return a generic 502 without persisting a partial turn. Both messages are inserted atomically after rechecking ownership, booking time, session status, and history. Concurrent sends can return 409; reload history before retrying. Clients should disable sending until a request finishes. A lost HTTP response after a successful commit requires reloading history before retrying; there is no persistent idempotency key. A concurrent conflict can still consume an AI request before being rejected.

Session requests are limited to 180 per IP per 15 minutes, with an additional 10 message sends per minute. Existing proxy and shared-store deployment notes apply. Tests use mocked AI and database transactions, including concurrent sends, expiry during generation, ownership, and rollback. Actual PostgreSQL concurrency still needs an isolated integration test.


## Swagger UI

Swagger starts automatically inside the same Express server with either `npm run dev` or `npm start` in `backend/`. No second process or port is required. Startup logs print the docs address.

- UI: `http://localhost:4000/api/docs/`
- OpenAPI JSON: `http://localhost:4000/api/docs/openapi.json`

Replace `4000` with your configured `PORT`. Use `localhost` for the development auth flow. Documentation covers all 29 API operations, request bodies, pagination, response shapes, bearer tokens, refresh cookies, validation and error responses. Static Swagger assets are served locally; the external spec validator is disabled. Authorization is not persisted across reloads. Documentation is available in production too; production auth POSTs still require `Origin` matching `FRONTEND_URL`, so host the UI and frontend on the same configured origin to use cookie authentication there.

Testing flow:

1. Open **Authentication → register → Try it out**, change the example email/password, and execute (creates a real user).
2. Execute **login** with the same credentials. Swagger sends `X-CSRF-Protection: 1` by default, and the browser supplies the Origin and manages refresh cookies.
3. Copy `data.accessToken`, click **Authorize**, paste the token without a `Bearer` prefix, then authorize.
4. Request booking availability for a current/future date and create a booking using a returned future `startTime`.
5. During the booked time, start a session with the booking ID. Use the session ID to send messages and inspect history, then complete the session.
6. When the access token expires, execute refresh and replace the token in **Authorize**.

Try it out uses the real API: mutations persist records and message sends use Gemini quota. Never paste the Gemini key into Swagger; keep it only in the root `.env`. Swagger security headers are adjusted only for the documentation routes; API security headers remain intact.


## Mood tracking and journals

Both `/api/moods` and `/api/journals` require a Bearer JWT and support:

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/moods` or `/api/journals` | Create your entry (201) |
| GET | collection path | Your entries, newest first, with pagination |
| GET | collection path + `/:id` | View your entry |
| PATCH | collection path + `/:id` | Update at least one field |
| DELETE | collection path + `/:id` | Delete your entry (204); missing or other-user entry returns 404 |

Mood body: `{"moodScore":3,"note":"A quiet day"}`. Score must be an integer 1–5; note is optional, max 2,000 characters, and can be cleared with null. Multiple entries per day are allowed. Journal body: `{"title":"Today","content":"Went for a walk"}`; title is 1–200 characters, content 1–6,000. Text is trimmed. Unexpected fields (including userId, id, and timestamps) are rejected. PATCH uses the same limits; empty updates fail. Server-assigned creation times cannot be changed.

Lists accept `page` (default 1), `limit` (default 20, max 100), and optional inclusive `from`/`to` ISO timestamps with timezone offsets. from must not follow to. Responses use `data.entries` and `data.pagination`; individual entry responses use `data.entry`. Each resource has a limit of 180 requests per IP per 15 minutes. No data is sent to Gemini by mood or journal endpoints. Models and tables already exist; no migration is required. Swagger includes these endpoints and request schemas. Automated tests use in-memory mocks and never modify Neon records.

## Checking the live Gemini connection

Run `cd backend && npm run check:ai` explicitly. It sends only a fictional greeting, uses a small amount of Google quota, and does not access the database. It prints the selected model, elapsed time, and greeting on success; failures print a safe HTTP status without provider details or keys. Tests never run this command automatically.

Gemini 3/4 text requests use low thinking to reduce latency, following [Google's thinking configuration guidance](https://ai.google.dev/gemini-api/docs/generate-content/thinking). The timeout can be set with `GEMINI_TIMEOUT_MS` (1,000–120,000 milliseconds, default 60,000). Timeouts return 504 without saving a partial conversation turn; quota errors return 503. A timeout does not prove the key is invalid, and the backend never silently changes models or retries generation.

`check:ai` also prints a fixed diagnostic category (for example `invalid_key`, `model_unavailable`, `quota_exceeded`, or `timeout`) and the upstream HTTP status where available. It never prints Google error bodies, keys, or conversation history. API responses remain generic; diagnostic categories are only enabled by the explicit CLI check.

Google HTTP 503 is returned as HTTP 503 with `service_unavailable` in the explicit CLI diagnostic. It indicates temporary provider unavailability, not necessarily an invalid key. To test an alternative without modifying `.env`, run `GEMINI_MODEL=your_available_text_model npm run check:ai` from `backend/`. No automatic fallback or retry is performed.
