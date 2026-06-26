# Toolpath API Demo

A small local demo app for the [Toolpath Public API](https://docs.toolpath.com/api).

The app lets you:

- Load your Toolpath cut configs.
- Select one or more cut configs.
- Upload a STEP file.
- Create a Toolpath part with `autoCreateProgram` enabled.
- Upload the file to the signed upload URL.
- Complete the part upload.
- Poll for generated programs and machinability scores.
- View status, setup count, duration, and score per program.

This is a local demo, not a production app. There is no login, no multi-user auth, and the local SQLite database is only for demo state.

## Requirements

- Node.js 20.19.0 or compatible. This repo includes `.tool-versions` for asdf users.
- npm.
- A Toolpath API key.

## Get a Toolpath API Key

1. Log in to your Toolpath account at [app.toolpath.com](https://app.toolpath.com). You must be a team admin.
2. Click your profile at the bottom left, then choose `My preferences`.
3. Navigate to the `API keys` tab.
4. Press `Create API key`.
5. Give the key a name and select `Read and write` permissions.
6. Press `Create key`.
7. Copy the key. Do not share it; you will only see it once.
8. Paste the key into your `.env` file as `TP_API_KEY`.

The Toolpath API is rolling out progressively. If you do not see the `API keys` tab, please [contact us](https://toolpath.com/support) to request access.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```bash
TP_API_KEY=tp_live_your_key_here
TP_API_BASE_URL=https://app.toolpath.com
PORT=3002
DATABASE_PATH=data/tp-api-demo.sqlite
POLL_INTERVAL_MS=5000
LOG_TOOLPATH_BODIES=false
```

Then run:

```bash
npm run dev
```

Open:

```text
http://localhost:3002
```

## API Flow

For each uploaded STEP file, the demo follows this sequence:

1. `POST /api/public/v0/parts` with `autoCreateProgram: true` and selected `cutConfigIds`.
2. `PUT` the STEP bytes to the signed upload URL returned by Toolpath.
3. `POST /api/public/v0/parts/{partId}/complete`.
4. Poll `GET /api/public/v0/parts/{partId}` until program IDs appear.
5. Poll nested program resources under `/parts/{partId}/programs/{programId}`.
6. Fetch `/parts/{partId}/programs/{programId}/machinability` for score, setup count, and duration.

## Reset Local State

Stop the app, then remove the SQLite file:

```bash
rm data/tp-api-demo.sqlite
```

The database is recreated automatically on the next `npm run dev`.

## Scripts

```bash
npm run dev        # run the local Express app with Vite middleware
npm run build      # build server and client output
npm start          # run the built server
npm test           # run Vitest
npm run typecheck  # run TypeScript checks
npm run lint       # run ESLint
```

## Logging

The server logs local requests and outbound Toolpath requests so you can watch the upload and polling flow.

By default, Toolpath response bodies are not logged. To include sanitized request and response bodies:

```bash
LOG_TOOLPATH_BODIES=true
```

The logger redacts common sensitive keys and strips query strings from URLs before printing.

## Secrets

Do not commit `.env`. It is ignored by `.gitignore`.

Before publishing this repo, make sure these paths are not tracked:

- `.env`
- `data/`
- `dist/`
- `node_modules/`
