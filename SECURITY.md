# Security Policy

## Supported Versions

Quarry is pre-1.0 and self-hosted only. Security fixes are made against
the `main` branch; there is no LTS branch to backport to. Always run
the latest `main` when self-hosting.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security
vulnerabilities.

Instead, report it privately using [GitHub's private vulnerability
reporting](https://github.com/samuelorobosa/quarry/security/advisories/new)
for this repository. Include:

- A description of the vulnerability and its impact
- Steps to reproduce (a minimal repro is ideal)
- The affected version/commit

You should expect an initial response within a few days. Since this is
a self-hosted, single-maintainer project, please allow reasonable time
for a fix before any public disclosure.

## Scope

Quarry is designed to run on a self-hosted server with no built-in
multi-tenant or public-internet-facing auth layer (see `README.md`'s
self-hosting section). Reports about the *default install lacking
auth* aren't vulnerabilities in the traditional sense — that's a
documented deployment assumption — but reports about anything that lets
an attacker escape that trust boundary (e.g. SSRF beyond the intended
scraping target, injection into the crawl/extract/monitor pipeline,
or unauthenticated access to another tenant's data on a shared
install) are very much in scope.
