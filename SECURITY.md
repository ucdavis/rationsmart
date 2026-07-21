# Security Policy

Thank you for helping protect RationSmart and its users. This policy supports
responsible vulnerability reporting and coordinated response consistent with
the [UC Davis College of Agricultural and Environmental Sciences Information
Technology Resources Guidelines](https://computing.caes.ucdavis.edu/files/CAESInformationTechnologyResourcesGuidelines22.pdf).

## Supported Versions

RationSmart has not yet published versioned releases. Until versioned releases
begin, security fixes are applied only to the latest revision of the default
branch.

| Version | Supported |
| --- | --- |
| Latest revision of `main` | Yes |
| Older revisions, other branches, and forks | No |

After versioned releases begin, only the latest release will receive security
updates unless a release announcement states otherwise.

## Reporting a Vulnerability

Do not report suspected security vulnerabilities through public GitHub issues,
pull requests, discussions, or other public channels.

Report them privately to the UC Davis Information Security Office at
[cybersecurity@ucdavis.edu](mailto:cybersecurity@ucdavis.edu). Use a subject such
as `[RationSmart Security] Brief description` so the report can be routed to the
appropriate maintainers.

Include as much of the following information as is practical:

- A description of the vulnerability and its potential impact
- The affected version, commit, endpoint, or component
- Steps needed to reproduce or verify the issue
- A minimal proof of concept, if available
- Any known mitigations or relevant environmental details
- A safe way to contact you with follow-up questions

Do not include real credentials, personal information, or other sensitive data
in the report. Use redacted or synthetic examples whenever possible. If you
encounter sensitive data while investigating, stop testing and report the issue
immediately.

## What to Expect

We aim to acknowledge reports within five business days. The UC Davis
Information Security Office and the repository maintainers will assess the
report, its impact, and the appropriate response. When practical, the reporter
will be told whether the issue was accepted or declined and may receive status
updates during remediation.

Response and remediation times depend on severity, complexity, affected data or
systems, and required institutional coordination. Some details may need to
remain confidential while an issue is being investigated or remediated.

## Coordinated Disclosure

Please allow reasonable time for investigation, remediation, testing, and any
required notifications before publicly disclosing a vulnerability. Coordinate
the timing of disclosure with the UC Davis Information Security Office and the
repository maintainers.

Do not disrupt services, access or modify data that does not belong to you, use
social engineering, or test against systems without authorization. Security
research can instead be performed against a locally controlled deployment using
synthetic data.

## Non-Security Issues

General bugs, feature requests, documentation problems, and other issues that do
not present a security risk may be reported through the repository's public
GitHub issue tracker.
