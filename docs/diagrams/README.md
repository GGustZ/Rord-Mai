# Rord-Mai report diagrams

Prepared 1 November 2026 for implementation baseline `639686b`. These are documentation of the current repository, not proof of hosted acceptance.

Baseline scope: the figures cover committed `639686b` and migrations 001-006. Uncommitted application changes and migration 007 appeared during the DFD revision and were left untouched. Migration 007's nullable GPA/credit pair and additional notification payload column are not represented in the baseline ERD; reconcile those when that application change is final.

- Open [the HTML pack](rord-mai-diagrams.html) and choose one of 11 figures. Radio controls work with keyboard navigation and JavaScript disabled; wide figures scroll on phones.
- Download [all 11 figures as PDF](rord-mai-report-diagrams.pdf). Each page has a matching numbered PNG and editable SVG under `exports/`.
- Open [the five-page editable DFD source](rord-mai-dfds.drawio) in diagrams.net. The DFD PNG exports also embed their own editable draw.io page, matching the reference file's format.
- Use the small export menu for the selected figure: Copy, PNG or single-page PDF at 2x resolution with padding. The two pinned CDN libraries are integrity-checked. When those libraries cannot load, use the supplied offline exports.
- All 11 figures use one paper theme: white backgrounds, black text/outlines/arrows, Arial typography and plain header-divided blocks. The HTML viewer, exports and editable DFD source use the same colours. ERD keys/cardinalities, DFD process/store symbols and architecture boundaries retain their own meaning. Diagram viewing has no JavaScript or web-font dependency.

| Figure | Topic |
| --- | --- |
| 1 | System architecture: four layers, Render, LINE, local OCR, Gemini and separate scheduler |
| 2 | Core ERD: seven tables, shared rules and private academic records |
| 3 | Supporting ERD: five additional tables, consent fields and deletion relationships |
| 4 | Level-0 context DFD: one process, external entities and labelled data exchanges |
| 5 | Level-1 DFD: processes 1.0-8.0 and repeated application-store aliases |
| 6 | System workflow: student journey, correction paths and blocked calculations |
| 7 | Consent lifecycle: independent choices, external gate and confirmed deletion |
| 8 | LINE processing: durable webhook intake and idempotent deadline notifications |
| 9 | Level-2 DFD for process 2.0: consent and confirmed deletion |
| 10 | Level-2 DFD for process 4.0: weighted scores, targets, GPAX and delta |
| 11 | Level-2 DFD for process 8.0: candidate evaluation, push and delivery state |

## Source and verification

The retained source ERD is [ERD.drawio](../database/diagrams/ERD.drawio). `diagram-manifest.json` records figure captions, physical fields and all FK definitions. The schema matches a read-only local database check after migrations 001-006: 12 tables, 89 columns, 12 primary keys and 15 foreign keys, including types, nullability and deletion actions.

Figure behaviour was checked against the HTTP routes, consent/academic/explanation/OCR/chat/notification services, pure engine, migration runner and `.github/workflows/deadline-alerts.yml`. The scheduler is an independent hourly GitHub Actions process, not a timer inside the web server. No table or field was invented to complete a picture.

Browser verification checks all 11 selectable views, text bounds, node overlap, connector routing, labels, exports, keyboard navigation and phone scrolling. The PDF contains 11 pages. A contact sheet, [diagram-overview.png](diagram-overview.png), provides a quick visual index.

The [DFD model](dfd-model.json) records each process, external entity, store alias and labelled flow. Every process has an input and output; external entities never connect directly to stores. Context/Level-1 external flows and all three Level-2 parent contracts balance. D1 denotes the same PostgreSQL domain store wherever repeated; its technical schema-migration records are omitted from domain flows. No Level 3 is introduced.

See [verification.md](verification.md) for checks performed and their limits.

## Evidence boundaries

The 1 November Render recovery restarted `c27a694` with a new empty database and passed public health/readiness checks. That older release is distinct from this pack's implementation baseline. These figures do not establish deployment of `639686b`, participant UAT, live phone delivery, scheduled execution, a universal subsecond webhook acknowledgement or the official repeated-course GPAX rule.

No application behaviour, database records, provider configuration, online tracker or slides were changed to produce this pack. Working generation/check scripts are kept in the project Context documentation area; professor-facing outputs are here.
