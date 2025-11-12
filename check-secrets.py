#!/usr/bin/env python3
"""
AI Agent Backend - Secret Verification Script (Python Version)
Run this script and report back the results
"""

import subprocess
import sys
import re

PROJECT_ID = "professional-website-462321"
SECRETS = [
    "anthropic-api-key",
    "claude-api-key",
    "jwt-secret",
    "encryption-key",
    "token-encryption-key",
    "database-url",
    "db-password",
    "google-client-id",
    "google-client-secret",
    "backend-url",
    "frontend-url",
    "app-oauth-redirect-uri",
    "oauth-redirect-uri",
    "mcp-oauth-redirect-uri"
]

def run_command(cmd):
    """Run a command and return (returncode, stdout, stderr)"""
    try:
        # Use shell=True to inherit PATH from the shell
        result = subprocess.run(" ".join(cmd), shell=True, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def print_colored(text, color):
    """Simple color printing for Windows"""
    colors = {
        'cyan': '\033[36m',
        'yellow': '\033[33m',
        'green': '\033[32m',
        'red': '\033[31m',
        'white': '\033[37m',
        'reset': '\033[0m'
    }
    print(f"{colors.get(color, '')}{text}{colors.get('reset', '')}")

def main():
    print_colored("========================================", 'cyan')
    print_colored("AI Agent Backend - Secret Verification", 'cyan')
    print_colored(f"Project: {PROJECT_ID}", 'cyan')
    print_colored("========================================", 'cyan')
    print()

    # Check if gcloud is installed
    print_colored("Checking gcloud installation...", 'yellow')
    exit_code, stdout, stderr = run_command(["gcloud", "--version"])
    if exit_code == 0:
        version = stdout.split('\n')[0] if stdout else "Unknown"
        print_colored(f"✓ gcloud installed: {version}", 'green')
    else:
        print_colored("✗ gcloud CLI not found. Please install it first.", 'red')
        print_colored("  Download from: https://cloud.google.com/sdk/docs/install", 'yellow')
        sys.exit(1)

    print()
    print_colored("Checking secrets in Secret Manager...", 'yellow')
    print()

    results = []
    missing_secrets = []
    found_secrets = []

    for secret in SECRETS:
        print(f"Checking: {secret}", end="")

        cmd = ["gcloud", "secrets", "versions", "access", "latest", "--secret", secret, "--project", PROJECT_ID]
        exit_code, stdout, stderr = run_command(cmd)

        if exit_code == 0:
            value = stdout.strip()
            length = len(value)
            has_whitespace = value != value.strip()

            # Validate based on secret type
            if secret == "anthropic-api-key":
                if value.startswith("sk-ant-"):
                    display = f"sk-ant-****... {length} chars OK"
                else:
                    display = "INVALID FORMAT! Should start with 'sk-ant-'"
            elif secret == "claude-api-key":
                if value.startswith("sk-ant-"):
                    display = f"sk-ant-****... {length} chars OK"
                else:
                    display = "INVALID FORMAT! Should start with 'sk-ant-'"
            elif secret == "jwt-secret":
                if length >= 32:
                    display = f"****... {length} chars OK"
                else:
                    display = f"TOO SHORT! Only {length} chars (need 32+)"
            elif secret == "encryption-key":
                try:
                    import base64
                    decoded = base64.b64decode(value)
                    if len(decoded) == 32:
                        display = '****... (base64, 32 bytes) OK'
                    else:
                        display = f"WRONG SIZE! {len(decoded)} bytes (need 32)"
                except Exception:
                    display = 'INVALID BASE64!'
            elif secret == "token-encryption-key":
                if length == 64 and re.match(r'^[0-9a-fA-F]{64}$', value):
                    display = '****... (64 hex chars) OK'
                else:
                    display = f"INVALID! Need 64 hex chars, got {length}"
            elif secret == "google-client-id":
                if value.endswith('.apps.googleusercontent.com'):
                    prefix = value[:min(20, len(value))]
                    display = f"{prefix}... OK"
                else:
                    display = "INVALID FORMAT! Should end with .apps.googleusercontent.com"
            elif secret == "google-client-secret":
                if value.startswith("GOCSPX-"):
                    display = f"GOCSPX-****... {length} chars OK"
                else:
                    display = "INVALID FORMAT! Should start with 'GOCSPX-'"
            elif secret in ["backend-url", "frontend-url", "app-oauth-redirect-uri", "oauth-redirect-uri", "mcp-oauth-redirect-uri"]:
                if value.startswith('https://'):
                    display = f"{value} OK"
                else:
                    display = f"{value} WARNING (Should use HTTPS)"
            else:
                display = f"****... {length} chars OK"

            print_colored(" OK", 'green')
            print(f"  Value: {display}")
            if has_whitespace:
                print_colored("  WARNING: Has leading/trailing whitespace!", 'yellow')

            found_secrets.append(secret)
            results.append({
                'secret': secret,
                'status': 'Found',
                'length': length,
                'has_whitespace': has_whitespace,
                'display': display
            })
        else:
            print_colored(" NOT FOUND", 'red')
            missing_secrets.append(secret)
            results.append({
                'secret': secret,
                'status': 'Missing',
                'length': 0,
                'has_whitespace': False,
                'display': 'Not found'
            })
        print()

    # Summary
    print()
    print_colored("========================================", 'cyan')
    print_colored("SUMMARY", 'cyan')
    print_colored("========================================", 'cyan')
    print()
    print(f"Total secrets checked: {len(SECRETS)}")
    print_colored(f"Found: {len(found_secrets)}", 'green')
    print_colored(f"Missing: {len(missing_secrets)}", 'red')
    print()

    if missing_secrets:
        print_colored("Missing Secrets:", 'red')
        for secret in missing_secrets:
            print(f"  - {secret}")
        print()

    # Critical checks
    print_colored("CRITICAL CHECKS:", 'cyan')
    print()

    has_anthropic_key = "anthropic-api-key" in found_secrets or "claude-api-key" in found_secrets
    has_jwt_secret = "jwt-secret" in found_secrets
    has_database = "database-url" in found_secrets or "db-password" in found_secrets
    has_oauth = "google-client-id" in found_secrets and "google-client-secret" in found_secrets
    has_urls = "backend-url" in found_secrets and "frontend-url" in found_secrets

    if has_anthropic_key:
        print_colored("OK Anthropic/Claude API Key: Present", 'green')
    else:
        print_colored("MISSING Anthropic/Claude API Key: MISSING (CRITICAL!)", 'red')

    if has_jwt_secret:
        print_colored("OK JWT Secret: Present", 'green')
    else:
        print_colored("MISSING JWT Secret: MISSING (CRITICAL!)", 'red')

    if has_database:
        print_colored("OK Database credentials: Present", 'green')
    else:
        print_colored("MISSING Database credentials: MISSING (CRITICAL!)", 'red')

    if has_oauth:
        print_colored("OK Google OAuth: Present", 'green')
    else:
        print_colored("MISSING Google OAuth: MISSING (Authentication won't work!)", 'red')

    if has_urls:
        print_colored("OK Backend/Frontend URLs: Present", 'green')
    else:
        print_colored("MISSING Backend/Frontend URLs: MISSING (CORS/OAuth will fail!)", 'red')

    print()
    print_colored("========================================", 'cyan')

    # Final verdict
    print()
    if not missing_secrets and has_anthropic_key and has_jwt_secret and has_database and has_oauth and has_urls:
        print_colored("OK ALL CRITICAL SECRETS PRESENT!", 'green')
        print_colored("Your backend should be able to start successfully.", 'green')
    else:
        print_colored("WARNING CONFIGURATION INCOMPLETE!", 'yellow')
        print_colored("Please add the missing secrets before deploying.", 'yellow')
    print()

if __name__ == "__main__":
    main()