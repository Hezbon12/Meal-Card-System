# ShuleMeal Cards — Production Deployment Guide

## 1. Generate secrets

```bash
# Generate a strong JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 2. Set up environment variables

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your real values:
#   JWT_SECRET=<generated above>
#   SUPER_ADMIN_PASSWORD=<strong password>
#   ALLOWED_ORIGIN=https://yourdomain.com
#   NODE_ENV=production
```

## 3. Build the frontend

```bash
npm install
npm run build
# Output is in ./dist — copy to your web server
```

## 4. Install backend dependencies

```bash
cd backend
npm install --omit=dev
```

## 5. Set up Nginx + SSL

```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx

# Copy the example config
sudo cp backend/nginx.conf.example /etc/nginx/sites-available/shulemeal
# Edit it: replace yourdomain.com with your actual domain
sudo nano /etc/nginx/sites-available/shulemeal

# Enable the site
sudo ln -s /etc/nginx/sites-available/shulemeal /etc/nginx/sites-enabled/

# Get SSL certificate (free)
sudo certbot --nginx -d yourdomain.com

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Run the backend with PM2 (keeps it alive after reboots)

```bash
npm install -g pm2
cd backend
pm2 start server.js --name shulemeal
pm2 save
pm2 startup  # follow the printed command to enable on boot
```

## 7. Set up automated daily backups

```bash
# Add to crontab (runs at 2am daily)
crontab -e
# Add this line:
0 2 * * * cd /path/to/backend && node backup.js >> /var/log/shulemeal-backup.log 2>&1
```

## 8. Verify everything works

```bash
# Check backend is running
curl https://yourdomain.com/api/health

# Check logs
pm2 logs shulemeal
```

## Security checklist before going live

- [ ] JWT_SECRET is a random 64-byte hex string
- [ ] SUPER_ADMIN_PASSWORD is strong and not the default
- [ ] ALLOWED_ORIGIN is set to your exact domain
- [ ] NODE_ENV=production
- [ ] SSL certificate is active (https works)
- [ ] Backups are running (check /path/to/backend/backups/)
- [ ] database.sqlite is NOT in a public web directory
