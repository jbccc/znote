# znote-server

Sync API server for znote. Handles data synchronization across web, desktop, and mobile clients.

## Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Web App   │  │ Desktop App │  │ Mobile App  │
│  (Next.js)  │  │ (Electron)  │  │  (future)   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │ HTTPS
                        ▼
              ┌─────────────────┐
              │   znote-server  │
              │    (Express)    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    Postgres     │
              └─────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Create database tables
npm run db:push

# Start development server
npm run dev
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Postgres connection string | `postgresql://user:pass@localhost:5432/znote` |
| `JWT_SECRET` | Secret for signing JWT tokens | `your-secret-key` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | `GOCSPX-xxx` |
| `PORT` | Server port | `3001` |

## API Endpoints

### Health Check

```
GET /health
```

Returns server status. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

### Authentication

#### Sign in with Google

```
POST /auth/google
```

Authenticate using a Google ID token (for mobile/desktop apps).

**Request:**
```json
{
  "idToken": "google-id-token",
  "refreshToken": "google-refresh-token"  // optional
}
```

**Response:**
```json
{
  "token": "jwt-token",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User Name",
    "image": "https://..."
  }
}
```

#### Internal Auth (NextAuth Bridge)

```
POST /auth/internal
```

Authenticate using user info from a trusted source (web app with NextAuth).

**Request:**
```json
{
  "googleId": "google-user-id",
  "email": "user@example.com",
  "name": "User Name",
  "image": "https://...",
  "refreshToken": "google-refresh-token"
}
```

**Response:** Same as `/auth/google`

#### Get Current User

```
GET /auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User Name",
    "image": "https://..."
  }
}
```

---

### Sync

All sync endpoints require authentication via `Authorization: Bearer <token>` header.

#### Push Changes

```
POST /sync/push
Authorization: Bearer <token>
```

Push local changes to the server. Handles conflict detection with "keep both" resolution.

**Request:**
```json
{
  "clientId": "unique-client-identifier",
  "blocks": [
    {
      "id": "block-id",
      "text": "Block content",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "calendarEventId": null,
      "position": 0,
      "version": 1,
      "updatedAt": "2025-01-15T10:00:00.000Z",
      "deletedAt": null
    }
  ],
  "tomorrowTasks": [
    {
      "id": "task-id",
      "text": "Task content",
      "time": "14:30",
      "position": 0,
      "version": 1,
      "updatedAt": "2025-01-15T10:00:00.000Z",
      "deletedAt": null
    }
  ],
  "settings": {
    "theme": "dark",
    "dayCutHour": 4,
    "updatedAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "applied": {
    "blocks": ["block-id-1", "block-id-2"],
    "tomorrowTasks": ["task-id-1"],
    "settings": true
  },
  "conflicts": [
    {
      "type": "block",
      "id": "conflicting-block-id",
      "localVersion": 2,
      "serverVersion": 3
    }
  ]
}
```

#### Pull Changes

```
GET /sync/pull?since=2025-01-15T10:00:00.000Z
Authorization: Bearer <token>
```

Pull changes since a timestamp (incremental sync).

**Query Parameters:**
- `since` (optional): ISO timestamp. If omitted, returns all data.

**Response:**
```json
{
  "blocks": [...],
  "tomorrowTasks": [...],
  "settings": {...},
  "syncedAt": "2025-01-15T10:30:00.000Z"
}
```

#### Full Sync

```
GET /sync/full
Authorization: Bearer <token>
```

Get all active (non-deleted) data. Used for initial sync.

**Response:** Same structure as `/sync/pull`

#### Resolve Conflict

```
POST /sync/resolve-conflict
Authorization: Bearer <token>
```

Mark a conflict as resolved.

**Request:**
```json
{
  "conflictId": "conflict-id",
  "resolution": "kept_both"  // or "kept_local", "kept_server"
}
```

---

### Calendar

#### Create Event

```
POST /calendar/event
Authorization: Bearer <token>
```

Create a Google Calendar event for a time-tagged block.

**Request:**
```json
{
  "blockId": "block-id",
  "title": "Meeting with team",
  "date": "2025-01-15",
  "time": "14:30",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{
  "eventId": "google-calendar-event-id"
}
```

#### Update Event

```
PATCH /calendar/event
Authorization: Bearer <token>
```

**Request:**
```json
{
  "eventId": "google-calendar-event-id",
  "title": "Updated title",
  "date": "2025-01-16",
  "time": "15:00",
  "timezone": "America/New_York"
}
```

#### Delete Event

```
DELETE /calendar/event
Authorization: Bearer <token>
```

**Request:**
```json
{
  "eventId": "google-calendar-event-id"
}
```

---

## Data Models

### Block

A single line/entry in the note.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Client-generated unique ID |
| `userId` | string | Owner user ID |
| `text` | string | Block content |
| `createdAt` | DateTime | When the block was created (content date) |
| `calendarEventId` | string? | Google Calendar event ID if synced |
| `position` | int | Order within same-second blocks |
| `version` | int | Increments on each edit (for conflict detection) |
| `updatedAt` | DateTime | Last modification time |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `clientId` | string? | Which client made the last change |

### TomorrowTask

A task scheduled for tomorrow.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Client-generated unique ID |
| `userId` | string | Owner user ID |
| `text` | string | Task content |
| `time` | string? | Time in "HH:MM" format |
| `position` | int | Order in list |
| `version` | int | For conflict detection |
| `updatedAt` | DateTime | Last modification time |
| `deletedAt` | DateTime? | Soft delete timestamp |

### Settings

User preferences.

| Field | Type | Description |
|-------|------|-------------|
| `theme` | string | "system", "light", or "dark" |
| `dayCutHour` | int | Hour when new day starts (0-23) |

---

## Sync Algorithm

### Client-side flow:

1. **On change**: Save to local storage, mark as `pending`
2. **On sync**: Push pending changes to server
3. **On push response**: Mark applied items as `synced`
4. **On pull**: Merge server data with local data

### Conflict resolution ("keep both"):

When the server detects a conflict:
1. Server version >= client version
2. Change came from a different client

Resolution:
1. Keep the server version as-is
2. Create a duplicate block with `[Conflict]` prefix
3. User manually resolves by editing/deleting

### Offline support:

1. All data stored locally (localStorage or SQLite in Electron)
2. Changes queue while offline
3. Sync automatically when back online

---

## Deployment

### Prerequisites

- Node.js 18+
- Postgres 14+
- Domain with SSL (for production)

### PM2 (recommended)

```bash
# On VPS
git clone <repo>
cd znote/server
npm install
npm run db:push

# Start with cluster mode (all CPU cores)
pm2 start npm --name znote-server -i max -- start
pm2 save
pm2 startup
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
RUN npx prisma generate
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then: `certbot --nginx -d api.yourdomain.com`

---

## Performance

### Optimizations implemented:

- **Batch queries**: Single query to fetch existing blocks instead of N
- **Transactions**: Atomic writes with fewer round trips
- **Parallel queries**: Pull/Full run 3 queries simultaneously
- **Compression**: Gzip responses (~70% smaller)
- **Connection pooling**: Prisma handles connection reuse

### Postgres tuning (for VPS):

```sql
-- postgresql.conf
shared_buffers = 256MB          -- 25% of RAM
effective_cache_size = 768MB    -- 75% of RAM
work_mem = 16MB
maintenance_work_mem = 128MB
```

### Database indexes:

Already defined in schema:
- `Block(userId, deletedAt)`
- `Block(userId, updatedAt)`
- `Block(userId, createdAt)`
- `TomorrowTask(userId, deletedAt)`

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm start` | Start production server |
| `npm run build` | Compile TypeScript |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Prisma Studio |
