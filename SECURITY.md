# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

BlackRoad OS, Inc. takes security seriously. If you discover a security vulnerability, please report it responsibly.

**DO NOT** open a public GitHub issue for security vulnerabilities.

### How to Report

1. **Email**: Send details to **blackroad.systems@gmail.com** with subject line: `[SECURITY] agents - <brief description>`
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Resolution target**: Within 30 days for critical issues

### Scope

The following are in scope:
- Source code in this repository
- Cloudflare Worker endpoints
- API authentication and authorization
- Data handling and storage
- Dependency vulnerabilities

### Out of Scope

- Issues in third-party dependencies (report upstream)
- Social engineering attacks
- Physical security
- Denial of service attacks

## Security Measures

This project implements:
- Pinned dependency versions with lockfile
- Automated dependency auditing via Dependabot
- CodeQL static analysis on every PR
- Secret scanning via TruffleHog
- HMAC-SHA256 webhook signature verification
- API key authentication on all protected endpoints
- CORS headers with strict origin policies
- Content Security Policy headers
- Regular security review schedule

## Disclosure Policy

We follow coordinated disclosure. Please allow us reasonable time to address the issue before any public disclosure.

---

Copyright (c) 2024-2026 BlackRoad OS, Inc. All Rights Reserved.
