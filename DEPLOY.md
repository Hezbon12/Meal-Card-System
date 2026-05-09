# ShuleMeal Cards — Production Deployment Guide

## Prerequisites

- **Node.js 20 LTS** (recommended)
- **PostgreSQL 14+** (local, Supabase, Railway, Render, or any managed PG)
- Nginx + Certbot for SSL
- PM2 for process management

---

## 1. Generate secrets

```bash
cd backend
npm run generate-secret   # copy the output as your JWT_SECRET
```

---

## 2. Set up environment variables

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Fill in **all** of these — the server will refuse to start in production if any are missing:

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ | 64-byte hex string from step 1 |
| `SUPER_ADMIN_PASSWORD` | ✅ | Strong password (A-Z, 0-9, symbol) |
| `ALLOWED_ORIGIN` | ✅ | Your exact domain, e.g. `https://shulemeal.yourdomain.com` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NODE_ENV` | ✅ | Set to `production` |
| `SENDGRID_API_KEY` | Optional | For signup email notifications |

**PostgreSQL options:**
- **Local:** `postgresql://postgres:password@localhost:5432/shulemeal`
- **Supabase (free tier):** Copy connection string from project settings
- **Railway:** Copy from Railway dashboard
- **Render:** Copy from Render database dashboard

---

## 3. Install dependencies

```bash
# Frontend
npm install

# Backend
cd backend
npm install
```

---

## 4. Build the frontend

```bash
# From project root
npm run build
# Output is in ./dist
```

---

## 5. Set up Nginx + SSL

```bash
sudo apt install nginx certbot python3-certbot-nginx

sudo cp backend/nginx.conf.example /etc/nginx/sites-available/shulemeal
sudo nano /etc/nginx/sites-available/shulemeal   # replace yourdomain.com

sudo ln -s /etc/nginx/sites-available/shulemeal /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Run the backend with PM2

```bash
npm install -g pm2
cd backend
pm2 start server.js --name shulemeal
pm2 save
pm2 startup   # follow the printed command to enable on boot
```

---

## 7. Set up automated daily backups

```bash
# Test the backup script first
cd backend
node backup.js

# Add to crontab (runs at 2am daily)
crontab -e
# Add this line (adjust path):
0 2 * * * cd /path/to/backend && node backup.js >> /var/log/shulemeal-backup.log 2>&1
```

---

## 8. Verify everything works

```bash
curl https://yourdomain.com/api/health   # should return {"ok":true}
pm2 logs shulemeal                        # check for errors
```

---

## Security checklist before going live

- [ ] `JWT_SECRET` is a random 64-byte hex string (not the default)
- [ ] `SUPER_ADMIN_PASSWORD` is strong and unique
- [ ] `ALLOWED_ORIGIN` is set to your exact domain (not `*`)
- [ ] `NODE_ENV=production`
- [ ] SSL certificate is active (https works)
- [ ] Backups are running (`ls backend/backups/`)
- [ ] `database.sqlite` is NOT in a public web directory
- [ ] `backend/.env` is NOT committed to git (check `.gitignore`)
- [ ] Root `server.js` has been deleted (done — was a security risk)

---

## Upgrading Node.js (if needed)

If you're on Node 24 and see binary errors:
```bash
# Install Node 20 LTS via nvm
nvm install 20
nvm use 20
cd backend && npm install
```
