# Row Rush

Row Rush is a mobile-first mass participation rowing race game. Players use phones as controllers, a room admin runs one room, and a projector displays the live canvas race.

## Routes

- Create room: `/`
- Player: `/r/{room_id}`
- Room admin: `/r/{room_id}/admin`
- Projector: `/r/{room_id}/projector`
- Global admin: `/globaladmin`

## Tech Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS
- Projector animation: HTML Canvas
- Backend: FastAPI
- Realtime: room WebSockets at `/ws/rooms/{room_id}` and global admin at `/ws/globaladmin`
- Persistence: in-memory room state

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

Edit `backend/.env` and set a real `GLOBAL_ADMIN_PASSWORD` before opening `/globaladmin`.

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

Open `http://127.0.0.1:5173/` to create a room. The room creator gets player, room admin, and projector links after creation.

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
- `GLOBAL_ADMIN_PASSWORD`: password required by `/globaladmin` before server-wide WebSocket commands are accepted.
- `MAX_TOTAL_PLAYERS`: total reserved player slots allowed across all active rooms. Defaults to `100`.
- `EMPTY_ROOM_TTL_SECONDS`: empty rooms expire after this many seconds. Defaults to `300`.
- `FINAL_RESULTS_TTL_SECONDS`: rooms on final results expire after this many seconds. Defaults to `600`.

For local development, copy the example file and set a real password:

```bash
cd backend
copy .env.example .env
```

Then edit `backend/.env`. Real `.env` files are ignored by Git.

## Game Flow

1. A host creates a room and reserves the number of player slots they realistically need.
2. Players join the room with a nickname.
3. Room admin opens boat selection.
4. Players choose one of five boats manually.
5. Boat capacity is fixed per round: `ceil(total_players_at_selection_open * 0.30)`.
6. Room admin starts a 3, 2, 1, ROW countdown.
7. Race runs for 40 seconds.
8. Phones send aggregated tap stats every 200ms.
9. Server owns timing, positions, random events, rankings, and scoring.
10. After three rounds, final individual leaderboard is shown.

## Railway Deployment

Recommended MVP setup on Railway Hobby: deploy this GitHub repo as two services in one Railway project.

- Backend service: builds from `backend`, runs FastAPI/WebSocket state.
- Frontend service: builds from `frontend`, serves the Vite app.

Keep backend replicas at `1`. Rooms live in memory, so multiple backend replicas would split players across different servers unless Redis or another shared state layer is added.

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
GLOBAL_ADMIN_PASSWORD=GENERATE_A_REAL_SECRET
CORS_ORIGINS=*
MAX_TOTAL_PLAYERS=100
EMPTY_ROOM_TTL_SECONDS=300
FINAL_RESULTS_TTL_SECONDS=600
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
PREVIEW_ALLOWED_HOSTS=.up.railway.app
```

Replace `YOUR_BACKEND_PUBLIC_URL` with the Railway backend domain, without `https://`.

If you add a custom frontend domain later, include it in `PREVIEW_ALLOWED_HOSTS` without `https://`:

```bash
PREVIEW_ALLOWED_HOSTS=.up.railway.app,row-rush.example.com
```

6. Deploy the frontend.
7. In the frontend service Networking settings, generate a public domain.
8. Open the frontend domain and create a room: `https://YOUR_FRONTEND_DOMAIN/`

### Tighten CORS

After the frontend public domain exists, update the backend variable:

```bash
CORS_ORIGINS=https://YOUR_FRONTEND_DOMAIN
```

Redeploy the backend. Keep `CORS_ORIGINS=*` only for quick event testing.

### Redeploys

Once both Railway services are connected to GitHub, pushing to the connected branch redeploys them. If you change `VITE_WS_URL`, redeploy the frontend because Vite reads `VITE_*` variables at build time.

## Notes

- Player identity is stored in `localStorage` per room and reconnects with the same `player_id`.
- Room capacity is reserved at creation time and released when the room expires, is ended by the room admin, or is destroyed by global admin.
- Empty rooms expire after 5 minutes by default. Rooms that reach final results expire after 10 minutes by default.
- Disconnecting during selection keeps the player slot for the MVP.
- Disconnecting during a race keeps previous contribution stats but adds no new taps.
- Boat power details are hidden during selection and revealed once racing/results begin.
- Projector hides boat counts until the race starts.
