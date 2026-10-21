# portfolio-likes-backend

Backend for Tejas Darunte portfolio like-button name submissions.

- **Runtime**: Node.js 20+ with ES Modules
- **Framework**: Express 4
- **Database**: Neon PostgreSQL (managed serverless)
- **Deployment**: Render (free tier Web Service)
- **Admin**: Local-only dashboard at `127.0.0.1:3001`

---

## Architecture Overview

```
Firebase Portfolio (public)
        │
        │  POST /api/submissions (HTTPS)
        ▼
   Render Web Service
   ┌────────────────────┐
   │  Express + Helmet  │
   │  CORS (exact origin)│
   │  Rate limiting      │
   │  Validation         │
   │  Submission service │
   └────────┬───────────┘
            │  parameterized queries (TLS)
            ▼
   Neon PostgreSQL (managed)
   ┌────────────────────┐
   │  submissions table  │
   │  (id, name, ts)     │
   └────────────────────┘
            ▲
            │  GET /admin/submissions (HTTPS + Bearer token)
   Local Admin Server (127.0.0.1:3001 only)
   ┌────────────────────┐
   │  Holds ADMIN_SECRET │
   │  Proxies to Render  │
   │  Serves dashboard  │
   └────────────────────┘
```

---

## Quick Start (Local Development)

```bash
# 1. Clone this repo (private)
git clone <your-private-repo-url>
cd portfolio-likes-backend

# 2. Install dependencies
npm install

# 3. Create your local backend .env
cp .env.example .env
# Edit .env: set DATABASE_URL, ALLOWED_ORIGIN, ADMIN_SECRET

# 4. Run the backend
npm run dev

# 5. (Separate terminal) Run the admin dashboard
cp local-admin-server/.env.example local-admin-server/.env
# Edit local-admin-server/.env: set ADMIN_SECRET (same as above), RENDER_API_URL
node local-admin-server/server.js
# Open http://127.0.0.1:3001
```

---

## Deployment Instructions

### Step 1: Create the Neon PostgreSQL database

1. Go to [neon.tech](https://neon.tech) → Sign up (free)
2. Create a new project (e.g., `portfolio-likes`)
3. Copy the **pooled connection string** (looks like `postgresql://user:pass@ep-xxx.pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`)
4. Keep this — you'll paste it into Render

**Free tier limits**: 1 GB storage, 100 compute-hours/month, 5-minute compute scale-to-zero. More than sufficient for a personal portfolio.

### Step 2: Create a private GitHub repository

```bash
# Initialize and push the backend repo
cd portfolio-likes-backend
git init
git add .
git commit -m "Initial backend implementation"
# Create a PRIVATE repo on GitHub named portfolio-likes-backend
git remote add origin https://github.com/Tej49251/portfolio-likes-backend.git
git branch -M main
git push -u origin main
```

⚠️ Confirm the repo is **private** before pushing.

### Step 3: Deploy to Render

1. Go to [render.com](https://render.com) → Sign up / log in
2. **New → Web Service → Connect GitHub** → select `portfolio-likes-backend`
3. Configuration:
   - **Name**: `portfolio-likes-backend` (or similar)
   - **Region**: Singapore (closest to India) or US East
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
4. Click **Create Web Service**

### Step 4: Set environment variables on Render

In Render dashboard → your service → **Environment**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon pooled connection string |
| `ALLOWED_ORIGIN` | `https://portfolio-tejas-4c9f7.web.app` |
| `ADMIN_SECRET` | Your generated 32+ char random string |
| `NODE_ENV` | `production` |

Generate the admin secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 5: Connect the Firebase frontend to Render

In your portfolio repo (`tejas-portfolio-2026`):

```bash
# Create local env file (gitignored by *.local pattern)
echo "VITE_LIKES_API_URL=https://your-service.onrender.com" > .env.local
```

Replace `your-service` with your actual Render service name.

### Step 6: Build and deploy the portfolio

```bash
cd tejas-portfolio-2026
npm run build
# Deploy using Firebase CLI (your existing workflow)
firebase deploy --only hosting
```

### Step 7: Set up the local admin dashboard

On your laptop only:
```bash
cp local-admin-server/.env.example local-admin-server/.env
```

Edit `local-admin-server/.env`:
```
ADMIN_SECRET=<same secret you put on Render>
RENDER_API_URL=https://your-service.onrender.com
DASHBOARD_PORT=3001
```

Start the dashboard:
```bash
node local-admin-server/server.js
```

Open `http://127.0.0.1:3001` in your browser.

---

## Running Tests

```bash
npm test
# Or with coverage
npm run test:coverage
```

---

## Security Notes

### Rate limiting
Rate limit state is **in-process memory**. It resets when Render restarts or cold-starts. An adversary could wait for a cold start to reset their limit. This is an accepted trade-off — adding Redis for distributed rate limiting would be disproportionate for this use case. See `src/middleware/rateLimiter.js` for documentation.

### IP addresses
Rate limiting is done by IP (correctly resolved via Render's single-hop proxy). IPs can be shared (NAT) or changed. Rate limiting is a deterrent, not a guarantee.

### Admin secret security
The admin secret is never:
- Committed to Git
- Sent to the public portfolio
- Embedded in browser JavaScript

The local admin server proxies requests to Render, attaching the `Authorization: Bearer` header server-side. The secret only travels over HTTPS.

### Duplicate names
A name alone cannot reliably identify a unique person. The soft duplicate guard prevents the same exact name from being submitted multiple times within a short window, but this is not identity deduplication.

---

## Rotating Secrets

If you need to rotate the admin secret:
1. Generate a new one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `ADMIN_SECRET` in Render's environment variables → Save (triggers redeploy)
3. Update `ADMIN_SECRET` in `local-admin-server/.env`

---

## Backing Up Data

Export all submissions from Neon:
```sql
-- In Neon console SQL editor
COPY submissions TO STDOUT WITH CSV HEADER;
```

Or via psql:
```bash
psql "your-neon-connection-string" -c "COPY submissions TO STDOUT WITH CSV HEADER" > backup.csv
```

---

## Troubleshooting

**"Render is waking up" message in dashboard**
Render free tier sleeps after 15 minutes of inactivity. The first request after sleep takes 30–60 seconds. Wait and refresh.

**CORS errors in browser console**
Check that `ALLOWED_ORIGIN` on Render exactly matches your Firebase hosting URL (including protocol, no trailing slash).

**429 Too Many Requests**
You've exceeded 5 submissions per 15 minutes. Wait and try again. Rate limit resets on next Render cold start.

**Database connection errors**
- Verify `DATABASE_URL` in Render environment variables
- Neon's compute also scales to zero after 5 minutes — first query may be slow
- Check Neon dashboard for usage limits

---

## Known Limitations

1. Rate limits reset on Render cold starts (in-memory state)
2. A name alone cannot uniquely identify a person — duplicate guard is soft
3. Render free tier sleeps after 15 minutes inactivity (30–60s cold start)
4. Neon free tier: 1 GB storage, 100 compute-hours/month
5. Both Render and Neon may have cold starts simultaneously on first request after inactivity
