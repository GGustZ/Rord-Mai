# Diagram verification, 1 November 2026

Implementation baseline: `639686b`. Documentation checks only; no application regression suite was rerun.

The later uncommitted migration 007 and accompanying application edits are outside this verification scope. The physical-schema checks below refer to the agreed migrations 001-006 baseline.

| Check | Observed result |
| --- | --- |
| Physical schema | Read-only local PostgreSQL check matched 12 tables, 89 columns, 12 primary keys and 15 foreign keys. |
| Field and relationship details | Names, PostgreSQL types, nullability, composite keys and FK deletion actions matched the retained ERD source. |
| Source behaviour | Checked against identity/privacy/OCR/webhook routes, academic/consent/explanation/chat/notification services, migration runner, engine and deadline workflow. |
| SVG layout | All 11 figures passed text bounds, node overlap, connector-through-node, label-over-node and viewBox bounds checks. |
| Unified paper theme | All 11 SVGs use only white and black paint, Arial typography and white export padding. PNG channels were checked for monochrome output; every figure has a white background. The HTML viewer and editable DFD pages use matching white/black styling. |
| Readability | Rendered figures and PDF pages reviewed; ERD labels remain outside entity boxes. |
| Offline and accessibility | All 11 figures selectable with JavaScript disabled and external requests blocked. Native radio keyboard navigation and 390 px phone scrolling passed. Direct file opening also passed without JavaScript or external resources. |
| Browser exports | Actual selected-figure PNG and single-page PDF downloads passed. Phone PNG export reviewed with the complete figure, padding, no toolbar and no adjacent caption. |
| Copy control | PNG clipboard API call verified with an isolated mock; the user's system clipboard was not modified. Clipboard access still depends on browser support and a secure context. |
| Export dependencies | Both downloaded pinned libraries matched the skill's SHA-384 integrity values. Supplied SVG/PNG/PDF files need no CDN access. |
| DFD semantics | Context/Level-1 external data contracts balance; processes 2.0, 4.0 and 8.0 preserve their parent contracts at Level 2. Every process has input/output; no external entity connects directly to a store. |
| Editable DFDs | Five uncompressed draw.io pages use standard grouped shapes and explicit connectors; each DFD PNG embeds its own editable page. XML and embedded metadata checked. Native diagrams.net import was not exercised. |
| Combined PDF | 11 numbered pages with matching figure images; rasterised pages reviewed. |
| Report integration | Figure links, captions and relative asset paths checked in architecture, database design and final-report documents. |

These checks establish diagram consistency and export behaviour. They do not establish deployment of this candidate, participant UAT, team sign-off, real scheduled notification receipt, the official repeated-course rule or provider retention policy. No real academic records were read and no migrations were executed for this work.
