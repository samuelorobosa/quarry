---
name: Bug report
about: Something isn't working as expected
title: ''
labels: bug
assignees: ''
---

**Describe the bug**
A clear description of what's wrong.

**To Reproduce**
Steps to reproduce, e.g.:
1. `POST /crawl` with `...`
2. See error / unexpected result

**Expected behavior**
What you expected to happen instead.

**Environment**
- Quarry version/commit: `git rev-parse HEAD`
- Deployment: Docker Compose / manual / `install.sh`
- Browser worker enabled: yes/no

**Logs**
Relevant output from `docker compose logs api` / `worker-fetch`, or the
`logs` table for a specific job/monitor. Redact secrets first.

**Additional context**
Anything else relevant (relevant `.env` config with secrets redacted,
target site behavior, etc.).
