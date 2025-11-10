# Backend Deployment Guide

Complete instructions for deploying the AI Agent Backend to Google Cloud Run.

## Prerequisites

✅ **Already configured in GCP:**
- Project: `professional-website-462321`
- All required secrets in Secret Manager
- Cloud Run service account has secret accessor permissions
- Cloud Build API enabled

## 📋 Secret Manager Status

Your backend requires these secrets (all **ALREADY EXIST** in Secret Manager):

| Secret Name (GCP) | Environment Variable | Status |
|------------------|---------------------|---------|
| `claude-api-key` | `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` | ✅ Exists |
| `jwt-secret` | `JWT_SECRET` | ✅ Exists |
| `token-encryption-key` | `TOKEN_ENCRYPTION_KEY` | ✅ Exists |
| `encryption-key` | `ENCRYPTION_KEY` | ✅ Exists |
| `google-client-id` | `GOOGLE_CLIENT_ID` | ✅ Exists |
| `google-client-secret` | `GOOGLE_CLIENT_SECRET` | ✅ Exists |
| `frontend-url` | `FRONTEND_URL` | ✅ Exists |
| `database-url` | `DATABASE_URL` | ✅ Exists (optional) |
| `db-password` | `DB_PASSWORD` | ✅ Exists (optional) |

**Note:** The backend's `env-loader.ts` automatically loads all these secrets when running on Cloud Run. No manual configuration needed!

## 🚀 Quick Deploy

### Option 1: Deploy from Local Machine (Recommended)

```powershell
# 1. Navigate to backend directory
cd "C:\Users\Hector's PC\Documents\Github\01-websites\applications\ai-assistant-pwa-v1\migrated-repos\ai-agent-backend"

# 2. Ensure you're authenticated
gcloud auth login
gcloud config set project professional-website-462321

# 3. Deploy to Cloud Run
gcloud run deploy ai-agent-backend `
  --source . `
  --project professional-website-462321 `
  --region us-central1 `
  --platform managed `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 10 `
  --memory 512Mi `
  --cpu 1 `
  --timeout 300s `
  --set-env-vars="NODE_ENV=production,CLOUD_RUN=true,GOOGLE_CLOUD_PROJECT=professional-website-462321"
```

**Expected output:**
```
Building and deploying...
✓ Creating Container Repository
✓ Uploading sources
✓ Building image
✓ Deploying to Cloud Run
Service [ai-agent-backend] revision [ai-agent-backend-00001] has been deployed
Service URL: https://ai-agent-backend-xxxxx-uc.a.run.app
```

**Time:** ~3-5 minutes

### Option 2: Deploy via Cloud Build

```powershell
# Submit build directly
gcloud builds submit --config cloudbuild.yaml --project professional-website-462321
```

## 🔧 Post-Deployment Configuration

### 1. Get Your Backend URL

```powershell
gcloud run services describe ai-agent-backend `
  --region us-central1 `
  --project professional-website-462321 `
  --format="value(status.url)"
```

**Example output:** `https://ai-agent-backend-xyz-uc.a.run.app`

### 2. Update Frontend URL Secret

After deploying the frontend, update the `frontend-url` secret:

```powershell
# Update the secret with your actual frontend URL
echo "https://your-frontend-url.web.app" | gcloud secrets versions add frontend-url --data-file=- --project=professional-website-462321

# Redeploy backend to pick up new secret
gcloud run services update ai-agent-backend --region us-central1 --project professional-website-462321
```

### 3. Configure Google OAuth Redirects

Add your backend URL to Google Cloud Console OAuth settings:

1. Go to: https://console.cloud.google.com/apis/credentials?project=professional-website-462321
2. Click on your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   ```
   https://YOUR-BACKEND-URL/api/auth/google/callback
   ```
4. Add to **Authorized JavaScript origins**:
   ```
   https://YOUR-BACKEND-URL
   https://YOUR-FRONTEND-URL
   ```
5. Save changes

### 4. Update CORS Origins

The backend automatically allows the `FRONTEND_URL` from Secret Manager. To add additional origins, edit `config/index.ts`:

```typescript
function getCorsOrigins(): Array<string | RegExp> {
  return [
    'http://localhost:8081',
    'http://localhost:19006',
    config.frontendUrl,  // From Secret Manager
    'https://your-custom-domain.com',  // Add custom domains here
  ];
}
```

Then redeploy.

## ✅ Verify Deployment

### 1. Health Check

```powershell
curl https://YOUR-BACKEND-URL/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-10T10:00:00.000Z",
  "environment": "production"
}
```

### 2. Check Logs

```powershell
# View recent logs
gcloud run services logs read ai-agent-backend --region us-central1 --project professional-website-462321 --limit 50

# Tail logs in real-time
gcloud run services logs tail ai-agent-backend --region us-central1 --project professional-website-462321
```

**Look for:**
```
☁️  Detected Cloud Run environment
☁️  Loading secrets from GCP Secret Manager...
✅ Loaded JWT_SECRET from Secret Manager
✅ Loaded CLAUDE_API_KEY from Secret Manager
✅ Loaded GOOGLE_CLIENT_ID from Secret Manager
✅ Available API keys: ANTHROPIC_API_KEY, CLAUDE_API_KEY
Server running on port 8080
```

### 3. Test Authentication Endpoint

```powershell
curl https://YOUR-BACKEND-URL/api/auth/google
```

Should redirect to Google OAuth consent screen.

## 🔄 Update Deployment

To deploy updates after code changes:

```powershell
# From backend directory
git add .
git commit -m "your changes"
git push

# Then redeploy
gcloud run deploy ai-agent-backend `
  --source . `
  --region us-central1 `
  --project professional-website-462321
```

**Or** set up automatic deployment via Cloud Build trigger (see Advanced section below).

## 📊 Monitoring

### View Service Metrics

```powershell
# Open Cloud Console monitoring
gcloud run services describe ai-agent-backend --region us-central1 --project professional-website-462321
```

Or visit: https://console.cloud.google.com/run/detail/us-central1/ai-agent-backend/metrics?project=professional-website-462321

**Monitor:**
- Request count
- Request latency
- Error rate
- Instance count
- Memory usage
- CPU usage

## 🐛 Troubleshooting

### Issue: Deployment Fails

**Check build logs:**
```powershell
gcloud builds list --project professional-website-462321 --limit 5
gcloud builds log BUILD_ID --project professional-website-462321
```

**Common issues:**
- Docker build errors → Check `Dockerfile` syntax
- TypeScript compilation errors → Run `npm run build` locally first
- Missing dependencies → Check `package.json`

### Issue: Service Crashes on Startup

**Check logs:**
```powershell
gcloud run services logs read ai-agent-backend --region us-central1 --project professional-website-462321 --limit 100
```

**Common causes:**
- Missing secrets → Verify all secrets exist in Secret Manager
- Port mismatch → Backend must listen on `PORT` env var (default 8080)
- Database connection → Check `DATABASE_URL` if using MCP features

### Issue: Secrets Not Loading

**Verify service account permissions:**
```powershell
# Check if service account has secret accessor role
gcloud projects get-iam-policy professional-website-462321 `
  --flatten="bindings[].members" `
  --filter="bindings.role:roles/secretmanager.secretAccessor"
```

**Grant permissions if needed:**
```powershell
gcloud projects add-iam-policy-binding professional-website-462321 `
  --member="serviceAccount:1025750725266-compute@developer.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"
```

### Issue: CORS Errors

**Solution:**
1. Check `config/index.ts` → `getCorsOrigins()`
2. Verify `FRONTEND_URL` secret matches your actual frontend URL
3. Redeploy backend after changes

### Issue: OAuth Flow Fails

**Check:**
1. Google OAuth credentials are correct in Secret Manager
2. Redirect URI is added to Google Cloud Console
3. `FRONTEND_URL` matches your actual frontend URL

## 🔐 Security Best Practices

✅ **Already configured:**
- Secrets stored in Secret Manager (not in code)
- Service account has minimal permissions
- HTTPS enforced by Cloud Run
- CORS protection enabled
- Rate limiting enabled
- Helmet security headers

**Recommendations:**
- [ ] Set up Cloud Armor for DDoS protection
- [ ] Enable Cloud Run IAM for authenticated access (if needed)
- [ ] Set up monitoring alerts for errors/latency
- [ ] Regularly rotate secrets (especially JWT_SECRET)

## 💰 Cost Optimization

Current configuration:
- **Min instances**: 0 (scales to zero when idle = $0)
- **Max instances**: 10
- **Memory**: 512Mi
- **CPU**: 1

**Expected costs:**
- Idle: ~$0/month (scales to zero)
- Light usage (< 1M requests): ~$5-10/month
- Medium usage: ~$20-50/month

**To reduce costs:**
```powershell
# Reduce max instances
gcloud run services update ai-agent-backend `
  --max-instances 5 `
  --region us-central1 `
  --project professional-website-462321
```

## 🚀 Advanced: CI/CD with Cloud Build Triggers

Set up automatic deployment on git push:

```powershell
# Create build trigger
gcloud builds triggers create github `
  --name="deploy-backend-on-push" `
  --repo-name="ai-agent-backend" `
  --repo-owner="sdhector" `
  --branch-pattern="^master$" `
  --build-config="cloudbuild.yaml" `
  --project=professional-website-462321
```

Now every push to `master` branch automatically deploys!

## 📚 Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Backend README](./README.md)
- [Frontend Repository](https://github.com/sdhector/ai-agent-frontend)

---

## ✅ Quick Deployment Checklist

- [ ] Run: `gcloud auth login`
- [ ] Run: `gcloud config set project professional-website-462321`
- [ ] Run: `gcloud run deploy ai-agent-backend --source . --region us-central1 --allow-unauthenticated`
- [ ] Save the service URL
- [ ] Test: `curl https://YOUR-URL/health`
- [ ] Check logs for secret loading confirmation
- [ ] Add OAuth redirect URI to Google Cloud Console
- [ ] Update `frontend-url` secret after frontend deployment

**Deployment time:** ~3-5 minutes  
**All secrets:** Already configured ✅  
**Ready to deploy:** YES 🚀

---

**Last Updated:** November 10, 2025
