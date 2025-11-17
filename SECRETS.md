# Secret Management

## GCP Secret Manager is the SINGLE SOURCE OF TRUTH

**IMPORTANT**: All secrets are loaded from GCP Secret Manager. There is NO fallback to local `.env` files.

### Why Secret Manager?

- **Single Source of Truth**: All secrets are stored in one place (GCP Secret Manager)
- **Consistent Across Environments**: Same secrets for local development and Cloud Run
- **Secure**: Secrets are encrypted and access-controlled via IAM
- **Auditable**: All secret access is logged in GCP

### Local Development Setup

1. **Authenticate with GCP**:
   ```bash
   gcloud auth application-default login
   ```

2. **Verify Authentication**:
   ```bash
   gcloud auth application-default print-access-token
   ```

3. **Set Project (optional)**:
   ```bash
   export GOOGLE_CLOUD_PROJECT=professional-website-462321
   ```

### Secret Naming Convention

Secrets in GCP Secret Manager follow this naming convention:

- **Environment Variable**: `GOOGLE_CLIENT_ID`
- **Secret Name in GCP**: `google-client-id` (lowercase with dashes)

The conversion is: `ENV_VAR_NAME` → `env-var-name`

### Required Secrets

The following secrets are loaded from Secret Manager:

- `GOOGLE_CLIENT_ID` → `google-client-id`
- `GOOGLE_CLIENT_SECRET` → `google-client-secret`
- `JWT_SECRET` → `jwt-secret`
- `ANTHROPIC_API_KEY` → `anthropic-api-key`
- `DATABASE_URL` → `database-url`
- `ENCRYPTION_KEY` → `encryption-key`
- `TOKEN_ENCRYPTION_KEY` → `token-encryption-key`
- `BACKEND_URL` → `backend-url`
- `FRONTEND_URL` → `frontend-url`
- And more... (see `config/env-loader.ts` for complete list)

### Managing Secrets

#### Create a New Secret

```bash
# Create secret from stdin
echo -n "your-secret-value" | gcloud secrets create secret-name --data-file=-

# Or from a file
gcloud secrets create secret-name --data-file=path/to/secret.txt
```

#### Update a Secret

```bash
# Add new version
echo -n "new-secret-value" | gcloud secrets versions add secret-name --data-file=-
```

#### List Secrets

```bash
gcloud secrets list
```

#### View Secret Value

```bash
gcloud secrets versions access latest --secret="secret-name"
```

### Cloud Run

On Cloud Run, authentication is automatic via the service account. Ensure the service account has the `Secret Manager Secret Accessor` role:

```bash
gcloud projects add-iam-policy-binding professional-website-462321 \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Troubleshooting

#### Error: Failed to connect to GCP Secret Manager

**Solution**: Ensure you are authenticated:
```bash
gcloud auth application-default login
```

#### Error: Permission Denied

**Solution**: Ensure your account has the `Secret Manager Secret Accessor` role:
```bash
gcloud projects add-iam-policy-binding professional-website-462321 \
  --member="user:YOUR_EMAIL@gmail.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### Error: Secret Not Found

**Solution**: Ensure the secret exists in Secret Manager with the correct name:
- Environment variable: `GOOGLE_CLIENT_ID`
- Secret name: `google-client-id`

### Migration from .env Files

If you have secrets in local `.env` files, migrate them to Secret Manager:

```bash
# For each secret in your .env file:
# 1. Read the value
grep "GOOGLE_CLIENT_ID" .env

# 2. Create secret in Secret Manager
echo -n "your-secret-value" | gcloud secrets create google-client-id --data-file=-

# 3. Verify it was created
gcloud secrets versions access latest --secret="google-client-id"
```

### Notes

- **No Fallback**: The application will NOT load secrets from local `.env` files
- **Always Secret Manager**: Whether running locally or on Cloud Run, secrets come from Secret Manager
- **Project ID**: Default project is `professional-website-462321` (can be overridden with `GOOGLE_CLOUD_PROJECT`)

