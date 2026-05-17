# Row Rush

Row Rush is a mobile-first mass participation rowing race game. Players use phones as controllers, an admin runs the show, and a projector displays the live canvas race.

## Routes

- Player: `/`
- Admin: `/admin`
- Projector: `/projector`

## Tech Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS
- Projector animation: HTML Canvas
- Backend: FastAPI
- Realtime: one WebSocket endpoint at `/ws`
- Persistence: in-memory MVP state

## Local Development

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

- Player: `http://127.0.0.1:5173/`
- Admin: `http://127.0.0.1:5173/admin`
- Projector: `http://127.0.0.1:5173/projector`

By default, the Vite dev frontend connects to `ws://127.0.0.1:8000/ws`.

If your backend is on a different local port, create `frontend/.env.local`:

```bash
VITE_BACKEND_PORT=8010
```

Or set the exact WebSocket URL:

```bash
VITE_WS_URL=ws://127.0.0.1:8010/ws
```

You can also temporarily override from the browser:

```text
http://127.0.0.1:5173/?ws=ws://127.0.0.1:8010/ws
```

That browser override is saved in `localStorage` as `row_rush_ws_url`.

## Environment Variables

Frontend:

- `VITE_WS_URL`: optional explicit WebSocket URL, for example `wss://row-rush-api.up.railway.app/ws`.
- `VITE_BACKEND_PORT`: optional local backend port when `VITE_WS_URL` is not set.

Backend:

- `PORT`: Railway sets this automatically.
- `CORS_ORIGINS`: comma-separated allowed origins. Use `*` for quick testing.

## Game Flow

1. Players join with a nickname.
2. Admin opens boat selection.
3. Players choose one of five boats manually.
4. Capacity is fixed per round: `ceil(total_players_at_selection_open * 0.30)`.
5. Admin starts a 3, 2, 1, ROW countdown.
6. Race runs for 40 seconds.
7. Phones send aggregated tap stats every 200ms.
8. Server owns timing, positions, random events, rankings, and scoring.
9. After three rounds, final individual leaderboard is shown.

## Railway Deployment

Recommended MVP setup: deploy frontend and backend as separate Railway services.

### Backend Service

1. Create a Railway service from this repository.
2. Set root directory to `backend`.
3. Use start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

4. Set `CORS_ORIGINS` to the frontend public URL, or `*` for event testing.
5. Keep replicas at `1`. The MVP stores authoritative state in memory and assumes one backend instance.

### Frontend Service

1. Create a Railway service from this repository.
2. Set root directory to `frontend`.
3. Build command:

```bash
npm install && npm run build
```

4. Serve the Vite build output with Railway's static hosting or a small static server.
5. Set:

```bash
VITE_WS_URL=wss://YOUR_BACKEND_PUBLIC_URL/ws
```

Replace `YOUR_BACKEND_PUBLIC_URL` with the Railway backend domain.

## Notes

- Player identity is stored in `localStorage` and reconnects with the same `player_id`.
- Disconnecting during selection keeps the player slot for the MVP.
- Disconnecting during a race keeps previous contribution stats but adds no new taps.
- Boat power details are hidden during selection and revealed once racing/results begin.
- Projector hides boat counts until the race starts.
