# Security Policy

`openclerk-core` is a zero-dependency, platform-agnostic TypeScript library for legal citation
parsing, Bluebook-format validation, and citation lookup. It is published to npm and consumed by
OpenClerk's host add-ins (Word, Google Docs) — it has no UI, no server, and no storage of its own;
the only network calls it makes are the citation-lookup requests a host asks it to perform against a
provider the user configured. Because it is used in legal work, we treat citation-verification
accuracy and safe hyperlink/HTML handling as security properties, not just correctness concerns.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull
requests.** Public disclosure before a fix exists puts users at risk.

Instead, report privately through GitHub's private vulnerability reporting:

1. Open the [**Security** tab](https://github.com/OpenClerkProject/openclerk-core/security) of this
   repository.
2. Click **"Report a vulnerability"** to open an advisory visible only to the maintainers.

> **Maintainer note:** if the "Report a vulnerability" button isn't visible, enable it once under
> **Settings → Code security and analysis → Private vulnerability reporting**.

Please include enough detail to reproduce and assess the issue:

- the affected function, file, and version or commit,
- steps to reproduce, or a proof of concept (a minimal citation string or provider config is ideal),
- the impact you believe it has (e.g. a fabricated citation reported as verified, a private-network
  request reaching an internal service, or unsafe output handed to a host for insertion).

`openclerk-core` is maintained by an individual, in the open, on a **best-effort basis** — there is
no paid support line or guaranteed response time. You can expect an acknowledgment as soon as the
maintainer is able, followed by coordination on a fix and a disclosure timeline.

## Coordinated disclosure

Please give the maintainer a reasonable opportunity to release a fix before disclosing publicly.
Once a fix ships, the advisory can be published and credit given to the reporter (if wanted). There
is no bug-bounty program.

## Supported versions

`openclerk-core` follows semantic versioning and is published to npm. Security fixes are made against
the **latest `0.4.x` release only**; please update to the latest `0.4.x` before reporting. Because
this is a library, a fix reaches end users only once the host add-in that depends on it advances its
`openclerk-core` version pin and re-releases (see [SECURITY_AUDIT.md](SECURITY_AUDIT.md), finding A,
on version-pin drift).

| Version | Supported |
| --- | --- |
| Latest `0.4.x` | ✅ |
| `< 0.4.0` | ❌ (update to the latest `0.4.x`) |

## Scope

**In scope** — the library code in this repository (`src/`) and its dev-time data-generation tooling
(`scripts/`). The security-sensitive areas, specifically:

- **Citation verification / hallucination detection** — a check must never report a fabricated
  citation as "verified" (the project's core trust property). This lives in the citation-parsing
  (`src/providers/citationParser.ts`) and hallucination-check (`src/providers/hallucinationCheck.ts`)
  logic.
- **Bluebook rule-checking** — the per-edition rule sets and shared rule modules under
  `src/bluebook/`, including the vendored reference data under `src/bluebook/generated/` and the
  pinned data-generation pipeline that produces it.
- **Text / HTML safety helpers** — URL-scheme validation and HTML escaping used before output is
  handed back to a host for insertion (`isSafeHyperlinkUrl`, `escapeHtml` in `src/utils.ts`).
- **Lookup-provider credential and endpoint handling** — enterprise-provider credentials are held in
  memory only (never persisted) and every user-supplied endpoint URL is validated for `https://` and
  blocked from loopback / link-local / private-network / cloud-metadata targets
  (`src/providers/base.ts`).
- **Regex complexity in document-scanning hot paths** — the citation-scanning regexes run over full
  document text; a catastrophic-backtracking (ReDoS) input is in scope.

**Out of scope:**

- **Third-party services** this library can talk to (CourtListener, Westlaw, LexisNexis, Bloomberg
  Law) — report issues in how *they* handle data to those vendors directly.
- **The host add-ins that consume this package** — the Word (`openclerk-word`) and Google Docs
  (`openclerk-web`, `openclerk-gdocs`) integrations each live in their own repository and do their
  own document I/O, UI, and hyperlink insertion. Report issues specific to a host add-in in that
  add-in's repository, not here.

## Existing security posture

A point-in-time manual audit — including the outbound-network/credential review, the HTML-escaping
and hyperlink-safety helpers, the `reporters-db` vendoring pipeline, and the regex-complexity
benchmarking — is recorded in [SECURITY_AUDIT.md](SECURITY_AUDIT.md).
