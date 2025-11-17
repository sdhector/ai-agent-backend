# AI Assistant Backend API

**Standalone Express.js API for AI chat functionality**

This repository contains the backend REST API for the AI Assistant application. The frontend (React Native PWA + Android APK) is in a separate repository.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Deployment](#deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Overview

This backend API provides:
- **AI Chat**: Streaming chat with Claude (Anthropic) models
- **Authentication**: Google OAuth + JWT-based auth
- **Conversations**: CRUD operations for chat conversations
- **MCP Integration**: Model Context Protocol server connections
- **Database**: PostgreSQL for persistent storage

**Technology Stack**:
- **Framework**: Express.js 4.21.2
- **Language**: TypeScript 5
- **Database**: PostgreSQL 14+
- **Deployment**: Google Cloud Run
- **Default Port**: 8080 (production), configurable for development

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Frontend (Separate Repository)        │
│  - React Native + Expo                 │
│  - PWA & Android APK                   │
│  - http://localhost:8081 (dev)         │
└──────────────┬──────────────────────────┘
               │
               │ HTTPS REST API
               │
┌──────────────▼──────────────────────────┐
│  Backend API (This Repository)         │
│  ├── /health                           │
│  ├── /api/ai (streaming chat)          │
│  ├── /api/auth (OAuth + JWT)           │
│  ├── /api/conversations                │
│  └── /api/mcp (tool management)        │
└──────────────┬──────────────────────────┘
               │
               ▼
       PostgreSQL Database
```

---

## Features

### Core Features
- ✅ **Streaming AI Chat**: Real-time streaming responses from Claude models
- ✅ **Multiple Models**: Support for Claude Sonnet 4.5, Opus 4.1, Haiku 3.5
- ✅ **User Authentication**: Google OAuth with JWT tokens
- ✅ **Conversation Management**: Save, load, and manage chat histories
- ✅ **MCP Support**: Connect to external tools (Gmail, Google Drive, Calendar)

### Security Features
- ✅ **CORS Protection**: Configurable allowed origins
- ✅ **Rate Limiting**: Prevent API abuse
- ✅ **Helmet**: Security headers
- ✅ **JWT Authentication**: Secure API access
- ✅ **Token Encryption**: Encrypted storage of OAuth tokens

### Production Features
- ✅ **Health Checks**: `/health` endpoint for monitoring
- ✅ **Error Handling**: Comprehensive error responses
- ✅ **Logging**: Structured logging for debugging
- ✅ **Cloud Run Deployment**: Automated CI/CD

---

## Prerequisites

- **Node.js**: 20+ (LTS recommended)
- **npm**: 10+
- **PostgreSQL**: 14+ (if using MCP features)
- **Anthropic API Key**: From https://console.anthropic.com/
- **Google OAuth Credentials**: From Google Cloud Console

---

## Getting Started

### 1. Clone Repository

```bash
git clone https://github.com/sdhector/ai-agent-backend.git
cd ai-agent-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

**IMPORTANT**: GCP Secret Manager is the **SINGLE SOURCE OF TRUTH** for all secrets.

There is **NO** local `.env` file fallback. All secrets must be stored in GCP Secret Manager.

#### Local Development Setup

1. **Authenticate with GCP**:
   ```bash
   gcloud auth application-default login
   ```

2. **Verify secrets exist in Secret Manager**:
   ```bash
   gcloud secrets list --project=professional-website-462321
   ```

3. **Required secrets** (see [SECRETS.md](./SECRETS.md) for complete list):
   - `google-client-id` → `GOOGLE_CLIENT_ID`
   - `google-client-secret` → `GOOGLE_CLIENT_SECRET`
   - `jwt-secret` → `JWT_SECRET`
   - `anthropic-api-key` → `ANTHROPIC_API_KEY`
   - `database-url` → `DATABASE_URL` (if using MCP)

See [SECRETS.md](./SECRETS.md) for detailed secret management instructions.

### 4. Run Locally

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

**Expected output**:
```
Server running on port 8080
Health check: http://localhost:8080/health
```

### 5. Test Backend

```bash
# Health check
curl http://localhost:8080/health

# Expected response:
# {"status":"healthy","timestamp":"2025-11-10T10:00:00.000Z"}
```

---

## API Endpoints

### Health Check

```http
GET /health
```

Returns server health status. No authentication required.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-10T10:00:00.000Z"
}
```

### Authentication

#### Google OAuth Login

```http
GET /api/auth/google
```

Redirects to Google OAuth consent screen.

#### Google OAuth Callback

```http
GET /api/auth/google/callback?code=...
```

Handles OAuth callback and returns JWT token.

#### Check Auth Status

```http
GET /api/auth/status
Authorization: Bearer <jwt_token>
```

Returns current user information.

### AI Chat

#### Send Message (Streaming)

```http
POST /api/ai
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "Hello, how are you?",
  "provider": "claude",
  "model": "sonnet-4.5",
  "conversationId": "optional-uuid"
}
```

Returns Server-Sent Events (SSE) stream with AI response.

### Conversations

#### List Conversations

```http
GET /api/conversations
Authorization: Bearer <jwt_token>
```

Returns array of user's conversations.

#### Get Conversation

```http
GET /api/conversations/:id
Authorization: Bearer <jwt_token>
```

Returns conversation details and messages.

#### Delete Conversation

```http
DELETE /api/conversations/:id
Authorization: Bearer <jwt_token>
```

Deletes a conversation.

### MCP (Model Context Protocol)

#### List MCP Servers

```http
GET /api/mcp/servers
Authorization: Bearer <jwt_token>
```

Returns available MCP servers (Gmail, Drive, Calendar).

#### Connect to MCP Server

```http
POST /api/mcp/connect
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "serverType": "gmail"
}
```

Initiates OAuth flow for MCP server connection.

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` |
| `JWT_SECRET` | Secret for signing JWT tokens | `your-32-char-secret` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `123.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | `GOCSPX-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `8080` |
| `BACKEND_PORT` | Alternative port variable | `8080` |
| `FRONTEND_URL` | Frontend URL for OAuth redirects | `http://localhost:8081` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `MCP_ENABLED` | Enable MCP features | `false` |
| `NODE_ENV` | Environment (development/production) | `development` |
| `ENABLE_RATE_LIMIT` | Enable rate limiting | `true` |
| `ENABLE_LOGGING` | Enable request logging | `true` |

### Generating Secrets

```bash
# JWT Secret (32 bytes, base64)
openssl rand -base64 32

# Encryption Key (32 bytes, base64)
openssl rand -base64 32

# Token Encryption Key (32 bytes, hex)
openssl rand -hex 32
```

---

## Development

### Project Structure

```
ai-assistant-backend/
├── config/                 # Configuration files
│   └── index.ts           # Main config
├── database/              # Database setup
│   └── index.ts          # PostgreSQL connection
├── middleware/            # Express middleware
│   ├── auth.ts           # JWT authentication
│   └── cors.ts           # CORS configuration
├── providers/             # AI providers
│   └── claude.ts         # Anthropic Claude provider
├── routes/                # API routes
│   ├── ai.js             # Chat endpoints
│   ├── auth.ts           # Authentication endpoints
│   ├── conversations.ts  # Conversation CRUD
│   ├── health.js         # Health check
│   └── mcp.ts            # MCP endpoints
├── services/              # Business logic
│   ├── mcp/              # MCP service implementations
│   └── encryption.ts     # Token encryption
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
├── server.js              # Entry point
├── package.json
├── tsconfig.json
├── Dockerfile
└── cloudbuild.yaml
```

### Development Workflow

1. **Make changes** to code
2. **Test locally**: `npm run dev`
3. **Run tests**: `npm test`
4. **Type check**: `npm run typecheck`
5. **Commit changes**: `git commit -m "feat: your changes"`
6. **Push to main**: Triggers auto-deployment to Cloud Run

### Adding New Endpoints

1. Create route file in `routes/`
2. Implement route logic
3. Add authentication middleware if needed
4. Register route in `server.js`
5. Test with curl or Postman
6. Update API documentation

---

## Deployment

### Google Cloud Run

This backend automatically deploys to Google Cloud Run when you push to the `main` branch.

#### Prerequisites

1. **Google Cloud Project** with billing enabled
2. **Cloud Run API** enabled
3. **Cloud Build API** enabled
4. **GitHub repository** connected to Cloud Build

#### Manual Deployment

```bash
# Authenticate with Google Cloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Build and deploy
gcloud builds submit --config cloudbuild.yaml

# Verify deployment
gcloud run services describe ai-assistant-backend --region=us-central1
```

#### Environment Variables (Production)

Set environment variables in Cloud Run:

```bash
# Using gcloud CLI
gcloud run services update ai-assistant-backend \
  --region=us-central1 \
  --set-env-vars="NODE_ENV=production,PORT=8080,FRONTEND_URL=https://your-pwa.web.app"
```

Or use **Google Secret Manager** for sensitive values:

```bash
# Create secret
echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-

# Grant access to Cloud Run
gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Use in Cloud Run
gcloud run services update ai-assistant-backend \
  --region=us-central1 \
  --set-secrets=JWT_SECRET=jwt-secret:latest
```

#### Deployment URL

After deployment, your backend will be available at:
```
https://ai-assistant-backend-<hash>-uc.a.run.app
```

Update this URL in your frontend's environment configuration.

---

## Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Manual API Testing

#### Test Health Endpoint

```bash
curl http://localhost:8080/health
```

#### Test Authentication (requires OAuth flow)

```bash
# Step 1: Visit OAuth URL in browser
open http://localhost:8080/api/auth/google

# Step 2: Complete OAuth flow, get JWT token

# Step 3: Use JWT token for authenticated requests
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8080/api/auth/status
```

#### Test Chat Endpoint

```bash
curl -X POST http://localhost:8080/api/ai \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello!",
    "provider": "claude",
    "model": "sonnet-4.5"
  }'
```

---

## Troubleshooting

### Issue: Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::8080`

**Solution**:
```bash
# Find process using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=8081 npm run dev
```

### Issue: CORS Errors

**Error**: `Access-Control-Allow-Origin` header missing

**Solution**:
1. Check `config/index.ts` → `getCorsOrigins()`
2. Add your frontend URL to allowed origins
3. Restart backend server
4. Hard refresh frontend

### Issue: Database Connection Failed

**Error**: `Error: connect ECONNREFUSED`

**Solution**:
1. Verify PostgreSQL is running
2. Check `DATABASE_URL` in `.env`
3. Test connection: `psql $DATABASE_URL`
4. Check firewall rules

### Issue: JWT Token Invalid

**Error**: `401 Unauthorized`

**Solution**:
1. Verify `JWT_SECRET` matches between frontend and backend
2. Check token expiration (default 7 days)
3. Try logging in again to get fresh token
4. Check `Authorization` header format: `Bearer <token>`

### Issue: Cloud Run Deployment Fails

**Error**: Build fails or service crashes

**Solution**:
1. Check Cloud Build logs: `gcloud builds list --limit=5`
2. View build details: `gcloud builds log BUILD_ID`
3. Common issues:
   - Missing environment variables
   - Docker build errors
   - Health check failing
4. Test Docker image locally:
   ```bash
   docker build -t ai-assistant-backend .
   docker run -p 8080:8080 --env-file .env ai-assistant-backend
   ```

---

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Make changes and test thoroughly
4. Commit changes: `git commit -m "feat: add your feature"`
5. Push to branch: `git push origin feature/your-feature`
6. Create Pull Request

---

## License

This project is licensed under the ISC License.

---

## Support

For issues, questions, or contributions:
- **GitHub Issues**: https://github.com/sdhector/ai-agent-backend/issues
- **Documentation**: See `/docs` folder for detailed guides

---

## Related Repositories

- **Frontend**: https://github.com/sdhector/ai-agent-frontend (React Native PWA + Android APK)

---

**Last Updated**: November 10, 2025
