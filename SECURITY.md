# Security policy

## Report a vulnerability

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/navet-app/navet-cards/security/advisories/new) or email `security@navet.app`.

Include the affected card and Home Assistant versions, reproduction steps, likely impact, and any suggested fix. Keep exploit details and credentials out of public issues while maintainers investigate.

## Supported versions

Navet Cards is in beta. Security fixes target the current development version and latest published beta when available.

## Scope

Relevant reports include unsafe action configuration, external artwork URLs, injected content, unintended service calls, and exposure of Home Assistant data. Cards use Home Assistant's supplied session and service API; account permissions are enforced by Home Assistant.

Give maintainers time to investigate and coordinate a fix before disclosing details publicly.
