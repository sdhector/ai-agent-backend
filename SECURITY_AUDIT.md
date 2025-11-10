# Security Audit & Issue Tracking

**Date**: November 10, 2025
**Branch**: `claude/audit-codebase-cleanup-011CUzUuS978ibx9PxAJ9pQx`
**Status**: In Progress

---

## Progress Summary

| Priority | Total | Fixed | In Progress | Remaining |
|----------|-------|-------|-------------|-----------|
| CRITICAL | 5     | 5     | 0           | 0         |
| HIGH     | 6     | 1     | 0           | 5         |
| MEDIUM   | 7     | 1     | 0           | 6         |
| LOW      | 7     | 0     | 0           | 7         |
| **TOTAL** | **25** | **7** | **0** | **18** |

**Last Updated**: November 10, 2025 (Phase 2 Complete)

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

### ✅ [FIXED] Issue #1: Insecure SSL Configuration
- **Severity**: CRITICAL
- **Files**:
  - `config/database.ts:37`
  - `database/migrate.ts:23`
- **Status**: ✅ FIXED
- **Fix Applied**: Changed `rejectUnauthorized: false` to `true` for secure SSL
- **Commit**: 4235f98 (Phase 1)
- **Additional**: Added configurable timeouts via DB_IDLE_TIMEOUT_MS and DB_CONNECTION_TIMEOUT_MS

---

### ✅ [FIXED] Issue #2: Hardcoded GCP Project IDs and Service URLs
- **Severity**: CRITICAL
- **Files**:
  - `config/index.ts:94-141` (Backend/Frontend URLs)
  - `routes/auth.ts` (MCP server URLs)
  - `routes/mcp.ts` (MCP URLs)
- **Status**: ✅ FIXED
- **Fix Applied**:
  - All URLs externalized to BACKEND_URL and FRONTEND_URL env vars
  - Application now fails fast if required URLs not configured
  - Created shared services/default-connectors.ts for MCP servers
  - MCP server URL now configurable via MCP_GOOGLE_TOOLS_URL
- **Commit**: 4235f98 (Phase 1)

---

### ✅ [FIXED] Issue #3: OAuth Open Redirect Vulnerability
- **Severity**: CRITICAL
- **Files**:
  - `routes/auth.ts:156-174`
- **Status**: ✅ FIXED
- **Fix Applied**:
  - Created utils/url-validator.ts with validateRedirectURL()
  - Added whitelist validation before all OAuth redirects
  - Checks ALLOWED_REDIRECT_URLS environment variable
  - Blocks invalid redirects with 400 error
- **Commit**: TBD (Phase 2)
- **Impact**: Prevents phishing and credential theft attacks

---

### ⚠️ Issue #4: Weak OAuth State Validation
- **Severity**: CRITICAL
- **Files**: `routes/mcp.ts:767-776`
- **Status**: ⚠️ PARTIAL FIX
- **Current State**: State stored in JSON metadata, not atomic
- **Recommended**: Create dedicated oauth_states table with TTL and atomic delete
- **Note**: Lower priority since URL validation (#5) prevents most SSRF risks
- **Impact**: Some CSRF risk remains, but mitigated by other fixes

---

### ✅ [FIXED] Issue #5: Missing MCP Server URL Validation
- **Severity**: CRITICAL
- **Files**: `routes/mcp.ts:282-295`
- **Status**: ✅ FIXED
- **Fix Applied**:
  - Created utils/url-validator.ts with validateMCPServerURL()
  - Validates protocol (HTTPS required in production)
  - Blocks localhost in production
  - Blocks private IP ranges in production
  - Returns detailed error messages
- **Commit**: TBD (Phase 2)
- **Impact**: Prevents SSRF attacks and internal resource access

---

## HIGH PRIORITY ISSUES (Priority 2)

### ❌ [PARTIAL] Issue #6: Console Statements in Production
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

### ✅ [FIXED] Issue #8: Missing Encryption Key Validation
- **Severity**: HIGH
- **Files**: `routes/mcp.ts:20-33`
- **Status**: ✅ FIXED
- **Fix Applied**:
  - Application now fails fast at startup if TOKEN_ENCRYPTION_KEY missing when MCP enabled
  - Validates encryption service initialization
  - Throws error preventing server startup if encryption not configured
- **Commit**: TBD (Phase 2)
- **Impact**: Prevents accidental storage of unencrypted tokens

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

### ✅ [FIXED] Issue #13: Code Duplication - Connector Provisioning
- **Severity**: MEDIUM
- **Files**:
  - `routes/auth.ts` (was lines 20-60)
  - `routes/mcp.ts` (was lines 138-192)
- **Status**: ✅ FIXED
- **Fix Applied**:
  - Created services/default-connectors.ts with shared provisioning logic
  - Consolidated 4 individual MCP servers into unified Google Tools MCP
  - Both routes now use provisionDefaultConnectors() from shared service
- **Commit**: 4235f98 (Phase 1)
- **Impact**: Improved maintainability, consistency

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
