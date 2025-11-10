# Cloud Run Deployment - Next Steps

**Date:** 2025-11-10
**Status:** Code changes complete - Ready for deployment and configuration

## Immediate Next Steps

### 1. Verify Deployment Success
After the next deployment, check the logs:
```bash
gcloud run logs read ai-agent-backend \
  --region=us-central1 \
  --limit=50 \
  --format="table(timestamp, textPayload)"
```

Look for:
- `[timestamp] Starting server initialization...`
- `[timestamp] Environment loaded in XXXms`
- `[timestamp] Server application loaded successfully`
- `🚀 Server started` message with port and environment

### 2. Get and Set Backend URL Secret
After successful deployment, get your service URL:
```bash
SERVICE_URL=$(gcloud run services describe ai-agent-backend \
  --region=us-central1 \
  --format='value(status.url)')

echo $SERVICE_URL

# Create the secret with actual URL
gcloud secrets create backend-url --data-file=- <<< "$SERVICE_URL"
```

### 3. Configure Frontend URL
Set your actual frontend URL:
```bash
gcloud secrets create frontend-url --data-file=- <<< "https://your-frontend.web.app"
```

### 4. Test Health Endpoint
```bash
curl https://ai-agent-backend-xxx.us-central1.run.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-10T...",
  "uptime": "...",
  "memory": {...},
  "environment": "production"
}
```

### 5. Verify Required Secrets Exist

Check that all critical secrets are in Secret Manager:
```bash
# List all secrets
gcloud secrets list

# Verify each critical secret
gcloud secrets versions access latest --secret="anthropic-api-key"
gcloud secrets versions access latest --secret="jwt-secret"
gcloud secrets versions access latest --secret="encryption-key"
```

## Required GCP Secret Manager Secrets

### Critical Secrets (Must be set before production use)
```bash
# API Keys
gcloud secrets create anthropic-api-key --data-file=- <<< "sk-ant-..."
gcloud secrets create jwt-secret --data-file=- <<< "your-secure-jwt-secret-min-32-chars"
gcloud secrets create encryption-key --data-file=- <<< "your-base64-encoded-32-byte-key"

# Database (if MCP enabled)
gcloud secrets create database-url --data-file=- <<< "postgresql://user:pass@host:5432/db"
gcloud secrets create db-password --data-file=- <<< "your-db-password"
gcloud secrets create token-encryption-key --data-file=- <<< "your-64-hex-char-key"
```

### OAuth Secrets (Required for user authentication)
```bash
gcloud secrets create google-client-id --data-file=- <<< "your-client-id.apps.googleusercontent.com"
gcloud secrets create google-client-secret --data-file=- <<< "your-client-secret"
```

### Optional Secrets
```bash
# Additional AI Providers
gcloud secrets create openai-api-key --data-file=- <<< "sk-..."
gcloud secrets create gemini-api-key --data-file=- <<< "..."

# CORS Configuration (if multiple origins needed)
gcloud secrets create allowed-origins --data-file=- <<< "https://app1.com,https://app2.com"

# MCP Configuration
gcloud secrets create mcp-enabled --data-file=- <<< "true"
gcloud secrets create oauth-redirect-uri --data-file=- <<< "https://your-backend.run.app/oauth/callback"
```

## Monitoring Setup

### 1. Set Up Alerts
Create alerts in Cloud Console for:
- Container startup failures
- High startup latency (> 30 seconds)
- Health check failures
- Configuration validation errors

### 2. Monitor Key Metrics
In Cloud Run console, track:
- Container startup time (target: < 15 seconds)
- Time to first request (target: < 20 seconds)
- Memory usage during startup
- CPU usage during initialization

### 3. Watch for Log Patterns
Key log patterns to monitor:
- `"Environment loaded in XXXms"` - should be < 5000ms
- `"Database connection initialized"` - should complete quickly
- Any `"Failed to load"` or `"Error during startup"` messages

## Troubleshooting

### If Deployment Still Fails

1. **Check Secret Manager access**
   ```bash
   gcloud secrets list
   gcloud secrets versions access latest --secret="anthropic-api-key"
   ```

2. **Verify Service Account permissions**
   ```bash
   gcloud projects get-iam-policy professional-website-462321 \
     --flatten="bindings[].members" \
     --filter="bindings.members:*compute@developer.gserviceaccount.com"
   ```

   Should have: `secretmanager.secretAccessor` role

3. **Check build logs**
   ```bash
   gcloud builds list --limit=1
   gcloud builds log [BUILD_ID]
   ```

4. **If still timing out**, add to `cloudbuild.yaml`:
   ```yaml
   - '--max-instances=10'
   - '--min-instances=0'
   - '--memory=1Gi'
   - '--cpu=2'
   ```

### If App Starts But OAuth Fails

1. Verify redirect URIs in Google Cloud Console OAuth settings
2. Check `backend-url` and `frontend-url` secrets match actual URLs
3. Review CORS origins in logs
4. Test with: `curl https://your-backend/api/auth/config-check`

### If Database Connection Fails (MCP mode)

1. Verify Cloud SQL connection settings
2. Check database credentials in Secret Manager
3. Ensure Cloud SQL Proxy is configured correctly
4. Review database connection pool settings

## Expected Performance

**Startup Timeline:**
- 0-2s: Container start, Node.js initialization
- 2-8s: Load secrets from Secret Manager
- 8-10s: Configuration validation
- 10-12s: Database connection (if MCP enabled)
- 12-15s: Express middleware initialization
- 15s: Server listening on port 8080

**Total startup time: ~15 seconds**

## Configuration Checklist

- [ ] Deployment succeeded without startup probe errors
- [ ] Service URL obtained and set as `backend-url` secret
- [ ] Frontend URL set as `frontend-url` secret
- [ ] Health endpoint returns 200 OK
- [ ] All required secrets exist in Secret Manager
- [ ] Service account has `secretmanager.secretAccessor` role
- [ ] OAuth credentials configured (if authentication enabled)
- [ ] CORS origins properly configured
- [ ] Monitoring and alerts set up
- [ ] Startup time consistently < 15 seconds

## Testing Checklist

After configuration:
- [ ] Test health endpoint: `/health`
- [ ] Test API root: `/`
- [ ] Test auth config: `/api/auth/config-check`
- [ ] Test OAuth flow (if enabled)
- [ ] Test AI endpoint: `/api/ai` (requires auth)
- [ ] Verify CORS headers on frontend requests
- [ ] Check logs for any warnings

## Additional Configuration

### Google OAuth Console Setup

If using Google authentication:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create or update OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `https://[YOUR-BACKEND-URL]/api/auth/google/callback`
4. Add authorized origins:
   - `https://[YOUR-FRONTEND-URL]`

### Database Setup (if MCP enabled)

1. Create Cloud SQL instance or use existing PostgreSQL
2. Run migrations (location TBD in project)
3. Set connection parameters in secrets
4. Test connection with: `psql $DATABASE_URL`

---

**Branch:** `claude/fix-cloud-run-startup-probe-011CUzZZ58LCFmSuABzAYrPB`
**Next deployment will include all startup probe fixes**
