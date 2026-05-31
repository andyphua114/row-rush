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
copy .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Edit `backend/.env` and set a real `ADMIN_PASSWORD` before opening `/admin`.

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
- `ADMIN_PASSWORD`: password required by `/admin` before admin WebSocket commands are accepted.

For local development, copy the example file and set a real password:

```bash
cd backend
copy .env.example .env
```

Then edit `backend/.env`. Real `.env` files are ignored by Git.

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

Recommended MVP setup on Railway Hobby: deploy this GitHub repo as two services in one Railway project.

- Backend service: builds from `backend`, runs FastAPI/WebSocket state.
- Frontend service: builds from `frontend`, serves the Vite app.

Keep backend replicas at `1`. The MVP stores authoritative game state in memory, so multiple backend replicas would split players across different games.

### GitHub Flow

1. Push this repository to GitHub.
2. In Railway, create a new project.
3. Choose `Deploy from GitHub repo` and select this repository.
4. Create the backend service first, then add a second service from the same GitHub repo for the frontend.
5. For each service, set the service root directory so Railway builds only that folder.

### Backend Service

1. Set root directory to `backend`.
2. Set start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

3. In Variables, set:

```bash
ADMIN_PASSWORD=GENERATE_A_REAL_SECRET
CORS_ORIGINS=*
```

4. Deploy the backend.
5. In the backend service Networking settings, generate a public domain.
6. Copy the backend public URL. You will use it for the frontend as `wss://BACKEND_DOMAIN/ws`.

### Frontend Service

1. Add another Railway service from the same GitHub repo.
2. Set root directory to `frontend`.
3. Set build command:

```bash
npm install && npm run build
```

4. Set start command:

```bash
npm run preview -- --host 0.0.0.0 --port $PORT
```

5. In Variables, set:

```bash
VITE_WS_URL=wss://YOUR_BACKEND_PUBLIC_URL/ws
```

Replace `YOUR_BACKEND_PUBLIC_URL` with the Railway backend domain, without `https://`.

6. Deploy the frontend.
7. In the frontend service Networking settings, generate a public domain.
8. Open the frontend domain:

- Player: `https://YOUR_FRONTEND_DOMAIN/`
- Admin: `https://YOUR_FRONTEND_DOMAIN/admin`
- Projector: `https://YOUR_FRONTEND_DOMAIN/projector`

### Tighten CORS

After the frontend public domain exists, update the backend variable:

```bash
CORS_ORIGINS=https://YOUR_FRONTEND_DOMAIN
```

Redeploy the backend. Keep `CORS_ORIGINS=*` only for quick event testing.

### Redeploys

Once both Railway services are connected to GitHub, pushing to the connected branch redeploys them. If you change `VITE_WS_URL`, redeploy the frontend because Vite reads `VITE_*` variables at build time.

## Notes

- Player identity is stored in `localStorage` and reconnects with the same `player_id`.
- Disconnecting during selection keeps the player slot for the MVP.
- Disconnecting during a race keeps previous contribution stats but adds no new taps.
- Boat power details are hidden during selection and revealed once racing/results begin.
- Projector hides boat counts until the race starts.
