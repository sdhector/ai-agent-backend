# Security Audit & Issue Tracking

**Date**: November 10, 2025
**Branch**: `claude/audit-codebase-cleanup-011CUzUuS978ibx9PxAJ9pQx`
**Status**: In Progress

---

## Progress Summary

| Priority | Total | Fixed | In Progress | Remaining |
|----------|-------|-------|-------------|-----------|
| CRITICAL | 5     | 1     | 0           | 4         |
| HIGH     | 6     | 0     | 0           | 6         |
| MEDIUM   | 7     | 0     | 0           | 7         |
| LOW      | 7     | 0     | 0           | 7         |
| **TOTAL** | **25** | **1** | **0** | **24** |

---

## CRITICAL ISSUES (Priority 1)

### ✅ [FIXED] Issue #0: CSRF Cross-Origin Validation
- **Severity**: CRITICAL
- **File**: `server-app.js:190, 201`
- **Status**: ✅ FIXED
- **Issue**: CSRF cookies using `sameSite: 'strict'` blocked cross-origin requests
- **Fix Applied**: Changed to `sameSite: 'none'` in production, `'lax'` in development
- **Commit**: e4974c9

---

### ❌ Issue #1: Insecure SSL Configuration
- **Severity**: CRITICAL
- **Files**:
  - `config/database.ts:37`
  - `database/migrate.ts:23`
- **Status**: ❌ NOT FIXED
- **Risk**: Man-in-the-middle attacks on database connections
- **Current Code**:
  ```typescript
  ssl: config.ssl ? { rejectUnauthorized: false } : false,
  ```
- **Required Fix**: Change to `rejectUnauthorized: true`
- **Impact**: Database connections currently vulnerable to MITM attacks

---

### ❌ Issue #2: Hardcoded GCP Project IDs and Service URLs
- **Severity**: CRITICAL
- **Files**:
  - `config/index.ts:94-141` (Backend/Frontend URLs)
  - `routes/auth.ts:24-60` (MCP server URLs)
  - `routes/mcp.ts:138-192` (Duplicate MCP URLs)
- **Status**: ❌ NOT FIXED
- **Exposed Information**:
  - Project ID: `1025750725266`
  - MCP Project ID: `27273678741`
  - Firebase Project: `ai-agent-frontend-462321`
- **Current Code**:
  ```typescript
  const backendUrl = 'https://ai-agent-backend-1025750725266.us-central1.run.app';
  const frontendUrl = 'https://ai-agent-frontend-462321.firebaseapp.com';
  ```
- **Required Fix**: Move all URLs to environment variables
- **Impact**: Infrastructure exposure, difficult environment management

---

### ❌ Issue #3: OAuth Open Redirect Vulnerability
- **Severity**: CRITICAL
- **Files**:
  - `routes/auth.ts:215`
  - `routes/mcp.ts:380, 900`
- **Status**: ❌ NOT FIXED
- **Risk**: Attackers can redirect users to malicious sites
- **Current Code**:
  ```typescript
  return res.redirect(`${frontendUrl}/login?error=...`);
  ```
- **Required Fix**: Validate frontend URL against whitelist before redirect
- **Impact**: Phishing attacks, credential theft

---

### ❌ Issue #4: Weak OAuth State Validation
- **Severity**: CRITICAL
- **Files**: `routes/mcp.ts:767-776`
- **Status**: ❌ NOT FIXED
- **Risk**: CSRF and replay attacks on OAuth flow
- **Current Code**:
  ```typescript
  const serverResult = await db.getPool().query(
    `SELECT * FROM mcp_servers
     WHERE user_id = $1
     AND oauth_metadata->>'state' = $2`,
    [userId, state]
  );
  ```
- **Required Fix**: Use dedicated state management table with automatic expiration
- **Impact**: OAuth flow vulnerable to CSRF and replay attacks

---

### ❌ Issue #5: Missing MCP Server URL Validation
- **Severity**: CRITICAL
- **Files**: `routes/mcp.ts:306-313`
- **Status**: ❌ NOT FIXED
- **Risk**: SSRF attacks via malicious MCP server URLs
- **Current Code**: No URL validation before storing
- **Required Fix**: Validate URLs and block internal IPs in production
- **Impact**: Server-Side Request Forgery, access to internal resources

---

## HIGH PRIORITY ISSUES (Priority 2)

### ❌ Issue #6: Console Statements in Production
- **Severity**: HIGH
- **Files**:
  - `routes/ai.js:43, 83, 456`
  - `utils/errors.ts:75`
  - `config/env-loader.ts` (multiple locations)
- **Status**: ❌ NOT FIXED
- **Risk**: Information leakage, breaks log aggregation
- **Required Fix**: Replace with structured logger
- **Impact**: Sensitive data exposure in logs

---

### ❌ Issue #7: Sensitive Error Information Leakage
- **Severity**: HIGH
- **Files**:
  - `routes/mcp.ts:1010`
  - `routes/ai.js:405-407`
- **Status**: ❌ NOT FIXED
- **Risk**: Exposes internal implementation details
- **Required Fix**: Return generic errors in production
- **Impact**: Information disclosure to attackers

---

### ❌ Issue #8: Missing Encryption Key Validation
- **Severity**: HIGH
- **Files**: `routes/mcp.ts:18-24`
- **Status**: ❌ NOT FIXED
- **Risk**: Tokens stored unencrypted if key missing
- **Required Fix**: Fail fast at startup if encryption key missing
- **Impact**: Sensitive OAuth tokens stored in plaintext

---

### ❌ Issue #9: Missing Rate Limiting on Auth Endpoints
- **Severity**: HIGH
- **Files**: `server-app.js:137-184`
- **Status**: ❌ NOT FIXED
- **Risk**: Brute force attacks on OAuth endpoints
- **Required Fix**: Apply rate limiting to auth routes
- **Impact**: Vulnerable to credential stuffing and brute force

---

### ❌ Issue #10: CORS Configuration Too Permissive
- **Severity**: HIGH
- **Files**: `config/index.ts:144-166`
- **Status**: ❌ NOT FIXED
- **Risk**: Broad regex patterns could be deployed to production
- **Required Fix**: Strict validation with environment-specific origins
- **Impact**: Cross-origin attacks if misconfigured

---

### ❌ Issue #11: Sensitive Error Response Logging
- **Severity**: HIGH
- **Files**: `routes/mcp.ts:830-835`
- **Status**: ❌ NOT FIXED
- **Risk**: Logging full error responses with sensitive data
- **Required Fix**: Sanitize error data before logging
- **Impact**: Credential leakage in logs

---

## MEDIUM PRIORITY ISSUES (Priority 3)

### ❌ Issue #12: Large Files Need Refactoring
- **Severity**: MEDIUM
- **Files**:
  - `routes/mcp.ts` (1,092 lines)
  - `providers/claude-legacy.ts` (913 lines)
  - `providers/claude.ts` (770 lines)
  - `routes/ai.js` (464 lines)
- **Status**: ❌ NOT FIXED
- **Required Fix**: Split into smaller, focused modules
- **Impact**: Maintainability, testability

---

### ❌ Issue #13: Code Duplication - Connector Provisioning
- **Severity**: MEDIUM
- **Files**:
  - `routes/auth.ts:20-60`
  - `routes/mcp.ts:138-192`
- **Status**: ❌ NOT FIXED
- **Required Fix**: Extract to shared service
- **Impact**: Maintenance burden, inconsistency risk

---

### ❌ Issue #14: Untyped Error Handling
- **Severity**: MEDIUM
- **Files**: `routes/mcp.ts:669, 737`
- **Status**: ❌ NOT FIXED
- **Required Fix**: Use proper TypeScript error typing
- **Impact**: Type safety, runtime errors

---

### ❌ Issue #15: Missing Authorization on Config Endpoint
- **Severity**: MEDIUM
- **Files**: `routes/auth.ts:63-85`
- **Status**: ❌ NOT FIXED
- **Required Fix**: Add authentication requirement
- **Impact**: Information disclosure

---

### ❌ Issue #16: Raw Error Object Logging
- **Severity**: MEDIUM
- **Files**: `routes/mcp.ts:670`
- **Status**: ❌ NOT FIXED
- **Required Fix**: Properly handle error type before logging
- **Impact**: Logging failures, type safety

---

### ❌ Issue #17: SQL Result Counting Inefficiency
- **Severity**: MEDIUM
- **Files**: `routes/mcp.ts:164-169`
- **Status**: ❌ NOT FIXED
- **Required Fix**: Use proper typing and efficient queries
- **Impact**: Performance, type safety

---

### ❌ Issue #18: Missing Rate Limit Validation
- **Severity**: MEDIUM
- **Files**: `server-app.js:137-184`
- **Status**: ❌ NOT FIXED
- **Required Fix**: Apply rate limiting to all sensitive endpoints
- **Impact**: API abuse, DoS vulnerability

---

## LOW PRIORITY ISSUES (Priority 4)

### ❌ Issue #19: Missing Input Validation - Message Metadata
- **Severity**: LOW
- **Files**: `routes/conversations.ts:131`
- **Status**: ❌ NOT FIXED

---

### ❌ Issue #20: Insecure Database Connection Timeout
- **Severity**: LOW
- **Files**: `config/database.ts:39-40`
- **Status**: ❌ NOT FIXED

---

### ❌ Issue #21: CSRF Cookie Configuration Notes
- **Severity**: LOW
- **Files**: `server-app.js:186-193`
- **Status**: ⚠️ REVIEW NEEDED
- **Note**: Verify HTTPS enforcement in all environments

---

### ❌ Issue #22: Unclear Error Messages for Users
- **Severity**: LOW
- **Files**: Multiple routes
- **Status**: ❌ NOT FIXED

---

### ❌ Issue #23: No Request ID Tracking
- **Severity**: LOW
- **Files**: Middleware
- **Status**: ❌ NOT FIXED

---

### ❌ Issue #24: Missing API Documentation
- **Severity**: LOW
- **Files**: All routes
- **Status**: ❌ NOT FIXED

---

### ❌ Issue #25: Unused Code and Imports
- **Severity**: LOW
- **Files**: Various
- **Status**: ❌ NOT FIXED

---

## Fix Implementation Order

### Phase 1: Critical Security (Do First)
1. ✅ Fix CSRF cross-origin (DONE)
2. Fix insecure SSL configuration
3. Remove hardcoded GCP IDs and URLs
4. Add OAuth redirect URL validation
5. Implement proper OAuth state management
6. Add MCP server URL validation

### Phase 2: High Priority Security
7. Replace console statements with logger
8. Remove sensitive error information
9. Add encryption key validation
10. Add auth endpoint rate limiting
11. Fix CORS validation
12. Sanitize error logging

### Phase 3: Code Quality
13. Extract duplicate connector code
14. Add proper error typing
15. Add auth to config endpoint
16. Improve SQL queries
17. Refactor large files

### Phase 4: Polish
18. Add input validation
19. Add request ID tracking
20. Improve error messages
21. Add API documentation
22. Clean up unused code

---

## Testing Checklist

- [ ] CSRF tokens work with Firebase frontend
- [ ] Database connections use secure SSL
- [ ] OAuth redirects reject invalid URLs
- [ ] OAuth state prevents replay attacks
- [ ] MCP server URLs validated
- [ ] No console.log in production
- [ ] Encryption key validated at startup
- [ ] Auth endpoints rate limited
- [ ] Error responses don't leak info
- [ ] All tests pass
- [ ] No security warnings from scanners

---

## Notes

- All fixes will be committed to branch: `claude/audit-codebase-cleanup-011CUzUuS978ibx9PxAJ9pQx`
- Each fix will be tested before committing
- Breaking changes will be clearly documented
- Environment variable changes will be added to `.env.example`

---

**Last Updated**: November 10, 2025
**Next Review**: After Phase 1 completion
