# Emotiq

Emotiq is an AI-powered emotional support graduation project. Planned features include registration and login, AI chat session booking, conversations with an AI assistant, mood tracking, journaling, and conversation history with session summaries.

The current implementation provides only the backend foundation and a health endpoint. Feature APIs, a database, authentication, AI integration, and the frontend have not been implemented.

## Project structure

```text
Emotiq/
├── frontend/
│   └── .gitkeep
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── env.js
│   │   ├── controllers/
│   │   │   └── health.controller.js
│   │   ├── routes/
│   │   │   ├── index.js
│   │   │   └── health.routes.js
│   │   ├── services/
│   │   │   └── .gitkeep
│   │   ├── models/
│   │   │   └── .gitkeep
│   │   ├── middlewares/
│   │   │   ├── error.middleware.js
│   │   │   └── notFound.middleware.js
│   │   ├── utils/
│   │   │   └── .gitkeep
│   │   ├── app.js
│   │   └── server.js
│   ├── tests/
│   │   └── .gitkeep
│   ├── package.json
│   └── package-lock.json
├── .env                      # Shared local configuration, ignored by Git
├── .env.example
├── .gitignore
└── README.md
```

## Run the backend

Install Node.js 22 or newer and npm. From the repository root:

```sh
cp .env.example .env # Only needed on a fresh clone; keep existing local settings
cd backend
npm ci
npm run dev
```

For normal startup without automatic restarts:

```sh
npm start
```

The default URL is `http://localhost:4000`. If port 4000 is already in use, choose another port in `.env` (for example, `PORT=4001`) and use that port in requests. The `.env` configuration is:

```ini
PORT=4000
NODE_ENV=development
```

The backend loads the shared root `.env` regardless of the working directory. Existing environment variables take precedence over `.env`. Only the root `.gitignore` is needed; its rules cover both application folders. Keep `.env.example` free of secrets and tracked by Git. Do not commit secrets or `.env` files. Dependencies in `node_modules/` are also ignored.

## Health endpoint

```sh
curl http://localhost:4000/api/health
```

Response (HTTP 200):

```json
{
  "success": true,
  "message": "Emotiq API is running"
}
```

## Backend organization

`app.js` configures and exports Express; `server.js` starts the HTTP listener. All future API routes belong under `/api` in `src/routes/index.js`. Controllers handle requests; the empty services, models, utils, and tests folders are reserved for future work.

The application uses JSON body parsing, CORS, Helmet security headers, and Morgan logging in development. Unknown routes return a JSON 404 response, and centralized error middleware handles errors. Express 5 forwards rejected promises from async route handlers to the error middleware automatically.
