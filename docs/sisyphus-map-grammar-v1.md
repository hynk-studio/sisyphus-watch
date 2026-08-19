# Sisyphus Watch Map Grammar v1

**Status:** Design-only application proposal for independent review

**Authoritative starting `main`:** `d1fb616bdcb8fb9fc957351e008c8817cb472102`

**Scope:** Presentation and derived-view architecture only

**Production implementation in this change:** None

This document proposes an information-display grammar for the Sisyphus Watch Map. It does not authorize or implement a production Map redesign, packet/schema/API changes, provider work, hosted work, a Sites Version, deployment, or D1 mutation.

The recommendation is a **Temporal Claim-Lineage Matrix**: selected time on the horizontal axis, candidate claim threads on the vertical axis, source-local claim occurrences as the primary nodes, candidate occurrence-to-occurrence relations as edges, source provenance attached to each occurrence, context-only sources as annotations, and a visibly non-chronological Unresolved rail as the endpoint.

The change in emphasis is deliberate:

1. **Primary:** temporal claim lineage.
2. **Secondary:** source provenance.
3. **Secondary:** candidate relation semantics.
4. **Endpoint:** unresolved evidence questions.

The Map would answer, “What changed, and how are claim occurrences connected?” Timeline would continue to answer when records appear on a selected time axis. Sources would continue to carry the complete provenance record. Method would continue to explain inclusion, processing, coverage, and limits.

## Source-bound design basis

This proposal was developed against the implementation and packet at the starting SHA above, including:

- `InvestigationMapView` and its desktop spatial/mobile linear render paths;
- `investigation-map` derivation, time grouping, coverage highlighting, thread tracing, relation projection, and question resolution;
- `site_ready_case_packet.v1`, claim occurrence, claim family, relation, lineage-row, timeline-row, and unresolved-question contracts;
- the prepared cooling-center fixture and deterministic lineage builder;
- Timeline, Sources, Method, and the focused inspector;
- the current `>920px` spatial and `<=920px` linear behavior;
- map, lineage, density, experience, temporal, inspector, and accessibility tests.

The current prepared packet contains exactly:

| Material | Current prepared value |
| --- | --- |
| Source snapshots | 4 |
| Claim occurrences | 3 |
| Candidate claim families | 2 |
| Candidate relations | 3 |
| Unresolved questions | 3 |
| Source-bound findings | 3 |
| Actions | 2 |
| Initial selected Map axis | Event time |
| Context-only sources | 1 editorial/opinion source with no claim occurrence |

The source-role coverage record is: Official & established `1`; Original records `0`; Local & firsthand `1`; Specialist context `1`; Challenges & corrections `1`. The absent Original records role is real coverage information, not a rendering error.

### Exact prepared material used in the proposal

The proposal and wireframes use these packet records without substituting or inventing content:

| Occurrence | Actor claim text | Event / assertion / publication time | Source provenance |
| --- | --- | --- | --- |
| Initial city availability | “Residents could find safe, air-conditioned spaces across the city.” | Jun 10 09:00 / Jun 10 09:00 / Jun 10 09:00 | Official notice — “Fictional city announces cooling centers for severe heatwave” |
| Community practical access | “Several listed cooling centers were not practically accessible.” | Jun 12 12:00 / Jun 12 18:30 / Jun 12 18:30 | Community report — “Volunteer network reports practical access issues at listed cooling centers” |
| Later city corrected/update | “The updated guidance corrected listing errors and improved access.” | Jun 14 14:15 / Jun 14 14:15 / Jun 14 14:15 | Official update — “Fictional city updates cooling center list and adds transport support” |

The fourth source is the candidate specialist/context record “Opinion note on emergency communication and street-level access.” It has no claim occurrence and no event time. Its publication time is Jun 15 08:00 and its retrieval time is Jun 15 12:00; it must remain Event time unavailable when Event time is selected.

The three current candidate relations are:

1. `supersedes`: initial city occurrence → later city update occurrence.
2. `contradicts`: initial city occurrence ↔ community access occurrence.
3. `follow_up`: community access occurrence → later city update occurrence.

All three are `pending_review` candidate records. The exact current unresolved questions are:

1. “How representative were the observed access gaps across all listed centers?” — related to the community actor claim.
2. “Did the correction and transport support reach vulnerable residents in time?” — related to the Jun 14 transport-support action.
3. “Does the city have a durable process for future emergency-list updates?” — related to the Jun 14 list/hours-update action.

### Epistemic invariants

Every alternative and the recommendation preserve these invariants:

- Publication time, event time, actor assertion time, and retrieval time are distinct.
- A missing selected-axis value is never replaced with another time type.
- Day-level records on the same date have no invented within-day sequence.
- In a mixed day/instant group, exact instants may retain clock order; day-level records remain unordered peers within that date.
- Live/model-derived records remain candidate and review-only.
- Source inclusion is neither endorsement nor truth verification.
- Relations are candidate review aids, not truth, causation, or acceptance judgments.
- Findings, claims, claim occurrences, and actions remain distinct record types.
- Focus, browsing, tracing, and coverage lenses cannot mutate canonical state.
- `canonical_mutation: none` remains true.
- A model-generated web-search summary is not captured source-page text.

## A. Current-Map diagnosis

### What the current spatial grammar communicates well

The current Map is strong at source accountability. It makes all source snapshots visible, carries source role, title, publisher/domain, selected-axis time, record boundary, a bounded preview, and a citation/fixture affordance into the primary canvas. A reviewer can see that the packet includes official, community, correction, and specialist/context material instead of assuming one homogeneous evidence pool.

The time treatment is also disciplined. The Map exposes all four axes, chooses event time initially when at least one explicit event value exists, keeps missing values in a Time unavailable region, groups same-calendar-day mixed precision, and removes the relation arrowhead when its current endpoint-order basis is non-chronological mixed precision. The shared Timeline applies the same no-substitution principle.

The current relation layer preserves each candidate relation and its exact occurrence IDs, source IDs, type, review state, reason, support references, parallel-relation identity, and lineage-row link. The accessible relation ledger prevents the SVG from being the only representation. Same-source relations remain in packet/detail/ledger even though their degenerate source-card self-loop is omitted spatially.

The current Map also succeeds in making open questions visible and explicitly labeling them “not conclusions.” Coverage lenses and thread tracing are viewing operations only. The focused inspector preserves scroll and focus, is nonmodal on desktop, becomes a focus-contained modal at mobile width, and keeps long support, provenance, limitation, timestamp, and technical material out of the card face.

### Where source-role lanes help

Source-role lanes answer a legitimate secondary question: “What kinds of sources are represented?” They make official/established material, original records, local/firsthand observations, specialist context, and challenges/corrections visually separable. They also make a missing target role visible. In the prepared case, the empty Original records lane is an honest representation of a coverage gap.

The lanes are useful when the reviewer is auditing diversity and provenance. They prevent an official update from visually masquerading as a community report, and they reveal that the editorial record is analysis/commentary rather than a factual claim occurrence.

### Where source-role lanes hurt claim-lineage readability

The vertical coordinate answers a provenance question while the edges answer a claim-lineage question. Those encodings compete.

- The two city occurrences belong to the same candidate family, but their sources sit in different lanes: Official & established and Challenges & corrections.
- The community occurrence belongs to a separate unresolved one-occurrence family, but its challenge and follow-up relations cross between that row and both city source rows.
- The editorial/context source has no claim occurrence and no event time, yet still occupies a source card, a specialist lane, and a time column.
- A blank role lane consumes vertical space even though it contains no claim path.

The result is that a user must first understand source categories, then infer which text inside each source card is the relevant claim, then follow edges that actually originate in claim occurrences but visually terminate on whole source records. The user question “What exactly am I supposed to follow?” has no single answer: source cards, time columns, role lanes, edge labels, topic root, and question cards all compete as the apparent path.

### What is duplicated from adjacent views

The current Map duplicates substantial responsibilities:

| Current Map material | Primary home elsewhere |
| --- | --- |
| Selected-axis chronological ordering and per-record timestamps | Timeline |
| Source title, publisher/domain, role, content preview, URL/fixture affordance, and source record boundary | Sources and source inspector |
| Source-role counts, baseline/expansion basis, missing role, record-boundary explanation, and relation limitations | Method |
| Full relation rationale and both bounded support excerpts | Relation inspector/ledger |
| Findings/actions counts and source-local detail | Source inspector and Method |

Some repetition is necessary for orientation. The problem is not that provenance or time appears in the Map; it is that full source cards are the primary nodes, so secondary information occupies the dominant visual weight.

### Why long cross-lane edges appear

Relations in the packet connect `left_occurrence_id` to `right_occurrence_id`. The current derived Map changes those endpoints to `left_source_id` and `right_source_id`. Source cards are then ordered into selected-time columns and separated vertically by source-role lanes. A relation between claims from different roles must therefore span both a temporal distance and a lane distance, even when the conceptual claim change is simple.

The prepared case produces all three forms of this problem:

- initial official source to later official-update source: a long diagonal across role lanes;
- initial official source to community source: a cross-lane challenge;
- community source to official-update source: another cross-lane response.

Question connections are longer still because their conservative source/topic origins are connected to a bottom question lane. The collision-avoidance code must search wide vertical offsets for relation labels because cards, paths, and other labels share one absolute stage.

### What empty lanes communicate and waste

An empty lane communicates a useful fact: a target source role is unrepresented. In the prepared case, Original records has count zero. It should not disappear from the product.

As a persistent spatial row, however, the lane wastes height and suggests that source-role completeness is the Map’s primary organizing principle. A compact coverage strip can preserve the zero count and missing-role warning without interrupting the claim path. Method should retain the full coverage basis and explanation.

### Are source cards the correct primary node type?

No. They are the correct primary node type for Sources, and a useful inspector target from Map, but not the correct Map node for the stated product question.

The card’s preview can be an actor claim, finding, action, or source summary depending on what the source contains. Its semantic type therefore changes from card to card. A source may contain multiple claims, one claim may appear in multiple sources as separate occurrences, and two claim occurrences may exist in one source. Projecting occurrence-level relations onto a source card obscures all three cases. The existing same-source relation test makes this concrete: the relation remains valid packet data, but the spatial source-card self-loop cannot express it.

The primary Map node should be the **claim occurrence**: a source-local instance of an actor claim with its own selected-axis times, status, support reference, source ID, and candidate-family membership.

### How unresolved questions fit—and conflict—with the current coordinates

Open questions are not ordinary chronological records, but the current bottom lane places them inside the same spatial stage as time columns, source lanes, and relation edges. They have no meaningful X coordinate and are spread across a three-card grid. Their dashed source/topic connectors can be mistaken for another relation class even though they mean only “related evidence gap.”

The current wording correctly says they are visible endpoints and not conclusions. The coordinate system does not fully deliver that promise. A separate Unresolved rail should retain the endpoint metaphor while explicitly sitting outside the chronological plane.

### Scan level versus inspector level

The Map scan level should contain only what is needed to follow claim change:

- candidate thread identity and uncertainty;
- actor;
- concise claim text;
- selected-axis time and precision state;
- occurrence review/canonical boundary;
- a compact source role + source title/publisher attachment;
- short candidate relation label and visible review state;
- unresolved question text and its conservative origin type;
- a compact, complete source-role coverage strip.

The inspector, Sources, or Method should carry:

- all four timestamps;
- full source title, URL, domain, snapshot status, retrieval mode, and retrieval time;
- content/candidate-summary distinction, full bounded excerpt, hashes, IDs, and API provenance;
- source inclusion reason, source context, information proximity, classification basis/status, comparison targets, and limitations;
- full relation reason, confidence, generation basis, insufficiency flag, both support references, and exact IDs;
- claim-family grouping reason/signals and membership diagnostics;
- findings and actions;
- full workload/coverage methodology and limitations.

## B. Three complete alternatives

### Alternative 1 — Temporal Claim-Lineage Matrix

This is the recommended design.

- **Primary user question:** How did source-local public claims change, interact, get challenged, get replaced, or remain unresolved over the selected time axis?
- **X axis:** The explicitly selected event, actor assertion, publication, or Sisyphus retrieval time. A separate terminal region holds Time unavailable; no substitution is allowed.
- **Y organization:** Candidate claim-family rows. Each row is visibly provisional. Occurrences without a reliable, internally consistent family assignment receive separate ungrouped rows.
- **Primary node type:** Claim occurrence.
- **Source provenance:** A compact provenance attachment inside the occurrence card: source role, short source title/publisher, and source record boundary when it differs from the occurrence boundary. It opens the source inspector.
- **Relation representation:** Direct occurrence-to-occurrence candidate connectors. Intra-thread connectors stay in-row; cross-thread connectors use shallow routed curves. Type is expressed by short text plus a restrained line/arrow family, never color alone.
- **Open-question representation:** One right-side Unresolved rail outside the chronological grid. Questions are single endpoint cards with conservative origin tethers/chips; multi-origin questions are not duplicated.
- **Context-only source representation:** A Context annotations strip below claim rows and above the Unresolved rail/ledger. A context source aligns to the selected axis only when that exact source-level axis value exists; otherwise it appears in Context · Time unavailable.
- **Time-unavailable behavior:** A visually separated, non-chronological terminal column. Cards there show the selected axis and “Time unavailable”; the column has no directional arrow relation to dated columns.
- **Mixed/day precision behavior:** One date band. Exact instants receive ordered subcolumns. Day-level records occupy a peer sub-band with no left/right order. Relations involving a day-level peer and an exact instant on that date do not receive a temporal arrowhead.
- **Claim-family uncertainty:** Row headers say Candidate thread and Needs review. `unresolved: true` says Grouping unresolved. A one-occurrence family says Single occurrence · no change sequence. Family IDs are never parsed into public labels.
- **Selected/focused behavior:** Selection highlights the occurrence, its candidate row, direct relation endpoints, and related unresolved endpoints while retaining other material in a dimmed state. The occurrence inspector opens; source provenance remains a distinct target.
- **Coverage lens behavior:** A compact coverage strip preserves every role and zero count. Lenses highlight matching provenance attachments, occurrences, context annotations, and related endpoints; they do not filter, delete, merge, or accept records.
- **Relation ledger role:** Complete accessible fallback and density control. It includes every relation, including same-source, parallel, unresolved, and unrelated candidates, using occurrence endpoints rather than source-card endpoints.
- **Desktop composition:** Sticky row headers, scroll-contained time matrix, aligned Unresolved rail, Context strip, then relation ledger.
- **Tablet composition:** Sticky narrower row headers and local horizontal analytical scrolling. The Unresolved rail moves below the matrix but remains a bordered, named endpoint region with origin chips.
- **Mobile composition:** Thread-grouped vertical sections. Occurrences run top to bottom inside each thread; intra-thread relations sit between cards; cross-thread relations become numbered chips backed by the complete ledger. Context annotations and the Unresolved rail remain distinct terminal sections.
- **Screen-reader/keyboard representation:** Semantic thread sections and occurrence buttons appear in DOM order; SVG paths are decorative. A complete ordered relation list names both occurrence endpoints, type, selected-axis ordering basis, and Needs review. Skip links reach Unresolved and Relations. Focus/scroll restore on inspector close.
- **Strengths:** Directly answers the product question; makes current occurrence and family records useful; preserves provenance without letting it dominate; supports same-source relations; keeps questions outside chronology; retains coverage transparently.
- **Weaknesses:** Candidate families are sparse and unlabeled; cross-thread edges can still cross; the matrix needs a robust ungrouped path; tablet requires contained horizontal scrolling.
- **Failure modes:** Treating a candidate family as accepted taxonomy; inventing family names from IDs; drawing directional arrows when selected-axis order is unavailable; allowing dense cross-thread labels to become cards; attaching action-linked questions to claim bodies as if the action were a claim.
- **Expected complexity with the current code/data:** Medium-high presentation refactor. The packet is sufficient for neutral rows, occurrence nodes, provenance, relations, current questions, context annotations, time axes, and coverage. No public schema/API change is required.

#### Prepared cooling-center case in the matrix

The explanatory row names below are neutral UI numbering. “T01/T02” are not packet fields and do not claim accepted topic taxonomy.

```text
MAP · selected axis: EVENT TIME
Rule: explicit event time only; no publication/assertion/retrieval substitution

COVERAGE  Official & established 1  |  Original records 0 MISSING
          Local & firsthand 1       |  Specialist context 1
          Challenges & corrections 1

TIME  ─────────── Jun 10, 09:00 ───────── Jun 12, 12:00 ───────── Jun 14, 14:15 ───┬─ TIME UNAVAILABLE ─┬─ UNRESOLVED RAIL
                                                                                  │                    │
T01  CANDIDATE THREAD · 2 occurrences · grouping needs review                    │                    │
     ┌──────────────────────────────┐                      ┌──────────────────────────────┐             │
     │ Fictional City EMO           │                      │ Fictional City EMO           │             │
     │ Residents could find safe,   │──── replaces [R1] ──▶│ Updated guidance corrected  │             │
     │ air-conditioned spaces       │                      │ listing errors and improved │             │
     │ across the city.             │                      │ access.                     │             │
     │ Event: Jun 10 · exact        │                      │ Event: Jun 14 · exact       │             │
     │ Needs: Prepared case record  │                      │ Needs review                │             │
     │ Source: Official notice      │                      │ Source: Official update     │             │
     │ “Fictional city announces…”  │                      │ “Fictional city updates…”   │             │
     └──────────────┬───────────────┘                      └──────────────▲───────────────┘             │
                    │ challenges [R2]                                      │ responds [R3]             │
                    │                                                      │                           │ Q2  Did correction and
T02  CANDIDATE THREAD · 1 occurrence · GROUPING UNRESOLVED                 │                           │     transport support reach
     │                         ┌──────────────────────────────┐              │                           │     vulnerable residents in time?
     └────────────────────────▶│ Fictional Neighborhood      │──────────────┘                           │     Origin: Jun 14 source action
                               │ Volunteer Network            │                                          │
                               │ Several listed cooling       │                                          │ Q3  Durable future update process?
                               │ centers were not practically │                                          │     Origin: Jun 14 source action
                               │ accessible.                  │                                          │
                               │ Event: Jun 12 · exact        │                                          │ Q1  How representative were the
                               │ Prepared case record         │                                          │     observed access gaps?
                               │ Source: Community report     │                                          │     Origin: Jun 12 actor claim
                               │ “Volunteer network reports…” │                                          │
                               └──────────────────────────────┘                                          │

CONTEXT ANNOTATIONS · not claim nodes
                                                                                  ┌────────────────────┐
                                                                                  │ Opinion /          │
                                                                                  │ interpretation     │
                                                                                  │ “Opinion note on   │
                                                                                  │ emergency…”        │
                                                                                  │ Event time         │
                                                                                  │ unavailable        │
                                                                                  └────────────────────┘

RELATIONS  R1 Replaces earlier guidance · candidate / needs review
           R2 Challenges earlier claim · candidate / needs review
           R3 Responds to earlier report · candidate / needs review
```

The two action-linked questions attach to the Jun 14 **source provenance anchor**, not to the Jun 14 claim body. That preserves actions ≠ claims. Q1 may attach directly to the community occurrence because its related actor claim resolves to that occurrence. The editorial source remains visible without pretending it is a claim occurrence or inventing an event time.

### Alternative 2 — Thread small multiples + provenance/relation ledger

This alternative removes cross-row line routing from the primary canvas. It is a hybrid lineage + ledger grammar, not a cosmetic matrix variant.

- **Primary user question:** What changed within each candidate claim thread, and which reviewed connections exist between threads?
- **X axis:** Selected time, independently but consistently scaled across every small-multiple row.
- **Y organization:** Candidate claim-family small multiples, one compact timeline per row.
- **Primary node type:** Claim occurrence.
- **Source provenance:** The same compact role/title/publisher attachment as Alternative 1, with a source-detail target.
- **Relation representation:** Intra-thread relations draw directly between occurrences. Cross-thread relations appear as matching numbered ports on their two occurrence cards and as full entries in an adjacent relation ledger. No cross-row curve is drawn.
- **Open-question representation:** A small unresolved endpoint well at the end of the relevant row when the origin is an occurrence; source/action/multi-origin questions remain in a global Unresolved panel with origin ports.
- **Context-only source representation:** A provenance/context ledger below the rows, time-aligned when possible and explicitly unavailable otherwise.
- **Time-unavailable behavior:** A shared terminal Time unavailable band on every row and the context ledger.
- **Mixed/day precision behavior:** Same date-band rules as Alternative 1; each row uses peer clusters for day-level occurrences.
- **Claim-family uncertainty:** Same candidate/unresolved row labels. A single-occurrence row is a valid review row but never styled as a completed history.
- **Selected/focused behavior:** Selecting an occurrence highlights its row and every numbered relation port. Selecting a ledger relation highlights both endpoint cards, even across rows.
- **Coverage lens behavior:** Coverage strip and non-destructive highlight. The provenance ledger also highlights matching source records.
- **Relation ledger role:** Primary for cross-thread relations and complete for all relations. Each entry is numbered, short at scan level, and opens the full relation inspector.
- **Desktop composition:** Small multiples occupy the main column; a 300–360px sticky relation/unresolved ledger occupies the right column.
- **Tablet composition:** Full-width small multiples followed by relation and unresolved ledgers. No cross-row SVG is lost because it never existed.
- **Mobile composition:** Each small multiple becomes a thread chapter. Relation port buttons open or jump to the matching ledger entry. The ledger is expanded by default.
- **Screen-reader/keyboard representation:** Particularly strong: row sections, occurrence buttons, and an ordered relation list require no spatial-edge interpretation. Port accessible names include the relation number and other endpoint.
- **Strengths:** Almost eliminates crossing/label collisions; scales better to 18+ relations; naturally represents same-source occurrences; robust on mobile; keeps the complete relation set inspectable.
- **Weaknesses:** The user cannot see the whole interaction network at a glance. Cross-thread challenge/response requires matching a port to a ledger entry. The Map risks feeling like several mini Timelines unless relation ports and thread framing are strong.
- **Failure modes:** Letting the ledger become a second Sources view; hiding cross-thread relations behind unexplained numbers; implying each family is authoritative; presenting per-row time scales that are not actually shared.
- **Expected complexity with the current code/data:** Medium. It needs occurrence/family derivation and new rendering, but less geometry than Alternative 1. No public packet change is required.

#### Prepared cooling-center case in small multiples

```text
THREAD SMALL MULTIPLES · EVENT TIME (one shared scale)
              Jun 10                     Jun 12                     Jun 14       Unresolved endpoint well

T01 Candidate thread · 2 occurrences
     [City: safe spaces across city]
       Official notice · Jun 10
       ports: R2
             └────────── R1 replaces ──────────────────────────────▶
                                                                  [City: corrected errors / access]
                                                                    Official update · Jun 14
                                                                    ports: R3
                                                                                Q2 via source action
                                                                                Q3 via source action

T02 Candidate thread · grouping unresolved · 1 occurrence
                                         [Community: not practically accessible]
                                           Community report · Jun 12
                                           ports: R2, R3
                                                                                Q1 via actor claim

CROSS-THREAD RELATION LEDGER
R2  Jun 10 City occurrence  — challenges —  Jun 12 Community occurrence   [Needs review]
R3  Jun 12 Community occurrence — responds — Jun 14 City occurrence       [Needs review]

CONTEXT / PROVENANCE LEDGER
[Time unavailable on Event time] Opinion / interpretation —
“Opinion note on emergency communication and street-level access”

COVERAGE  Official 1 | Original 0 missing | Local/firsthand 1 | Specialist 1 | Challenge/correction 1
```

This is the best fallback if independent review decides that a complete cross-thread edge field is too dense or too hard to make accessible. It preserves claim-thread identity but gives up the matrix’s at-a-glance interaction pattern.

### Alternative 3 — Git-like claim history

This alternative treats each candidate family as a provisional branch and occurrences as commits. It is included because it is a genuinely different lineage grammar and reveals useful tradeoffs; it is not recommended.

- **Primary user question:** Along which provisional claim branches did public statements appear, diverge, and later reconnect?
- **X axis:** Candidate claim-family branches.
- **Y organization:** Selected time runs top to bottom. Same-date peer bands span branches.
- **Primary node type:** Claim occurrence (“history point”), not source.
- **Source provenance:** A compact tag adjacent to each history point; full source record stays in inspector/Sources.
- **Relation representation:** Same-family transformative relations follow the branch rail. Cross-family challenge/follow-up relations use bridge lines. Labels remain candidate and review-only.
- **Open-question representation:** An Unresolved issues rail after the chronological history, with back-reference ports to history points or source/action anchors.
- **Context-only source representation:** Side annotations beside the time rail, never commits/history points.
- **Time-unavailable behavior:** A separate bottom band after a visible axis break; it is not “later than” dated records.
- **Mixed/day precision behavior:** Same-date day-level records share a horizontal peer band. Exact instants may be vertically ordered within the date; day-level records cannot be placed above/below exact instants as chronology.
- **Claim-family uncertainty:** Every branch is dashed and labeled Candidate grouping. Ungrouped occurrences create isolated provisional branches; no visual merge implies acceptance.
- **Selected/focused behavior:** Selecting a point highlights its branch, direct bridges, and unresolved endpoints. Inspector behavior is otherwise the same.
- **Coverage lens behavior:** Compact source-role strip plus provenance-tag highlight; branches never disappear.
- **Relation ledger role:** Complete textual representation and the only representation for unrelated, dense parallel, or ambiguous-direction relations.
- **Desktop composition:** Vertical time rail with horizontally arranged provisional branch columns and a right annotation/Unresolved column.
- **Tablet composition:** Horizontally scrollable branch area with sticky time labels; annotation/Unresolved sections move below.
- **Mobile composition:** Branches collapse into labeled thread chapters with time top to bottom. This is comprehensible, but the visual branch metaphor largely disappears.
- **Screen-reader/keyboard representation:** A chronological list grouped by date, then by candidate branch, followed by relations and unresolved questions. SVG rails are decorative.
- **Strengths:** Strong sense of version/change; same-family supersession is easy to see; vertical time is familiar on mobile.
- **Weaknesses:** “Commit,” “branch,” and “merge” imply authoritative version control and accepted state. Cross-family contradictions do not behave like merges. The public audience may read vertical order as causal or read a branch join as adjudication. Source/provenance coverage becomes less prominent.
- **Failure modes:** Treating candidate groupings as official branches; treating relation joins as accepted merges; implying later means truer; inventing chronological order within a day; using the source-control metaphor in public copy.
- **Expected complexity with the current code/data:** High. It needs branch routing, semantic guardrails, date-band layout, a separate accessible structure, and substantial responsive transformation. No packet change is strictly required, but the metaphor would benefit from reviewed family names and explicit relation directionality that the packet does not currently provide.

#### Prepared cooling-center case in Git-like history

```text
EVENT TIME ↓        T01 Candidate branch                T02 Candidate branch             CONTEXT

Jun 10 09:00        ● City: safe spaces across city
                    │ Official notice
                    │\
                    │ \ R2 challenges ───────────────────────┐
                    │                                         │
Jun 12 12:00        │                                         ● Community: not practically accessible
                    │                                         │ Community report
                    │                                R3 responds /
                    │                                           /
Jun 14 14:15        ● City: corrected errors / access ◀────────┘
                    ▲ Official update
                    └ R1 replaces earlier guidance

AXIS BREAK ───────────────────────────────────────────────────────────────────────────────
Time unavailable                                                                    ◇ Opinion / interpretation
                                                                                      no event time

UNRESOLVED ISSUES RAIL
Q1 representative access gaps  ← Community actor claim
Q2 remediation reached residents ← Jun 14 source action
Q3 durable update process       ← Jun 14 source action
```

The metaphor is visually efficient for R1 but less honest for R2/R3 and for candidate family uncertainty. That makes it inferior to the matrix for Sisyphus Watch.

### Alternative comparison

| Criterion | Temporal matrix | Small multiples + ledger | Git-like history |
| --- | --- | --- | --- |
| Claim change at a glance | Strong | Strong within a thread; weaker across threads | Strong for same-family sequence |
| Cross-thread interaction | Visible directly | Ledger-mediated | Visible but metaphorically ambiguous |
| Dense relations | Medium; needs density policy | Strong | Weak-medium |
| Provenance without domination | Strong | Strong | Medium |
| Unresolved-question separation | Strong | Strong | Strong |
| Mobile continuity | Strong with thread chapters | Strongest | Medium |
| Risk of epistemic overclaim | Low if rows remain candidate | Low | High |
| Current-packet fit | Strong | Strong | Medium |
| Expected implementation complexity | Medium-high | Medium | High |

## C. Prepared-case placement summary

Every serious alternative above places the same packet material without inventing records:

| Existing material | Matrix | Small multiples | Git-like history |
| --- | --- | --- | --- |
| Initial city availability claim | Jun 10 occurrence in T01 | Jun 10 occurrence in T01 | Jun 10 history point on T01 branch |
| Community practical-access claim | Jun 12 occurrence in T02 | Jun 12 occurrence in T02 | Jun 12 history point on T02 branch |
| Later city corrected/update claim | Jun 14 occurrence in T01 | Jun 14 occurrence in T01 | Jun 14 history point on T01 branch |
| Specialist/editorial source | Context annotation; Event time unavailable | Context/provenance ledger; Event time unavailable | Side annotation; Event time unavailable |
| Supersedes relation | Occurrence-to-occurrence solid directional R1 | Intra-thread direct R1 | Same-branch R1 |
| Contradicts relation | Cross-thread non-directional challenge R2 | Cross-thread ledger R2 | Cross-branch bridge R2 |
| Follow-up relation | Cross-thread directional R3 | Cross-thread ledger R3 | Cross-branch bridge R3 |
| Representativeness question | Unresolved rail, actor-claim origin | T02 endpoint well | Unresolved rail |
| Remediation reach question | Unresolved rail, Jun 14 source-action origin | Global unresolved panel | Unresolved rail |
| Durable update process question | Unresolved rail, Jun 14 source-action origin | Global unresolved panel | Unresolved rail |
| Current source roles | Provenance badges + coverage strip | Provenance badges + coverage strip | Provenance tags + coverage strip |
| Selected time semantics | Event time; no substitutions | Event time; no substitutions | Event time; no substitutions |

Changing the selector to Publication time would move the community occurrence from Jun 12 12:00 to Jun 12 18:30 and would place the editorial context annotation at Jun 15 08:00. Changing to Actor assertion time would move the community occurrence to Jun 12 18:30 while leaving the editorial annotation unavailable because the site-ready source summary has no actor-assertion field or claim occurrence for it. Retrieval time would place the three occurrences and editorial context at the explicit Jun 15 retrieval instant; equal times must not be turned into an invented order.

## D. Record-type mapping for the recommended design

| Record type | Map treatment | Detail destination and boundary |
| --- | --- | --- |
| Source snapshot | **Secondary inline provenance attachment** on an occurrence. If it has no occurrence, **context annotation**. Never the ordinary primary node. | Source inspector and Sources carry full snapshot, content boundary, URL, hashes, retrieval, classification, inclusion reason, and limitations. |
| Actor claim | **Not a separate map node.** Supplies actor/claim identity and supports resolving questions to its source-local occurrence(s). | Claim/occurrence inspector. Actor claim and occurrence remain distinct records. |
| Claim occurrence | **Primary map node.** One node per source-local occurrence. | Occurrence inspector shows all four time fields, uncertainty, status, support, family, and source. |
| Candidate claim family | **Claim-thread row container/header.** It is candidate structure, not truth or accepted taxonomy. | Family inspector shows occurrence membership, reason, signals, unresolved flag, origin, and review status. |
| Source-bound finding | **Inspector-only detail**; never a claim node and never an edge origin merely because it exists. | Source inspector; Method explains the distinction. |
| Action | **Inspector-only detail.** It may be named as the conservative origin of an unresolved question through a source provenance anchor; it does not become a claim node. | Source/record inspector; Method explains actions ≠ claims. |
| Candidate relation | **Occurrence-to-occurrence edge** plus a complete ledger entry. | Relation inspector contains long reason, support excerpts/references, confidence, generation basis, insufficiency, and IDs. |
| Unresolved question | **Endpoint card in the Unresolved rail.** It has no chronological coordinate and is not a conclusion. | Question inspector shows conservative origin resolution and exact related IDs. |
| Context-only source | **Context annotation** outside claim rows; aligned only to an explicit selected-axis value or placed in Context · Time unavailable. | Source inspector and Sources. It is never forced into a claim family. |

No presentation rule may promote a finding to a claim, an action to a claim, a source to an occurrence, a family to accepted taxonomy, or a candidate relation to a truth judgment.

## E. Normative Map Grammar v1

The following rules define the recommended design.

### 1. Time axis

- The Map **MUST** name the selected axis in visible text.
- Claim occurrences **MUST** use the matching occurrence field: `event_time_candidate`, `assertion_time_candidate`, `source_publication_time`, or `source_retrieval_time`.
- Context annotations **MUST** use only an explicitly available source-level value for the selected axis. They **MUST NOT** borrow another axis.
- The initial-axis rule **SHOULD** remain event time when any occurrence has explicit event time, then publication time; retrieval time **MUST NOT** become an automatic fallback merely because it exists.
- A Map axis change is a viewing operation and **MUST NOT** change the packet.

### 2. Claim-thread rows

- Each internally consistent `candidate_claim_family` **SHOULD** create one row.
- The row header **MUST** say Candidate thread or equivalent and show occurrence count.
- Rows **MUST NOT** be labeled by parsing `family_id`.
- Without a reviewed display label, a row **SHOULD** use neutral numbering plus a representative claim excerpt, for example “T01 · Candidate thread · 2 occurrences.”
- Row order **SHOULD** be deterministic: earliest explicit selected-axis date, then stable family ID. Same-day peer families **MUST NOT** imply within-day order through numbering.

### 3. Occurrence cards

- A claim occurrence **MUST** be the ordinary primary node.
- The card **MUST** show actor, concise original claim text, selected-axis time/precision state, occurrence record boundary, and a source provenance attachment.
- The card **MUST NOT** replace the original claim with a finding, action, or model synthesis.
- Long claims **MAY** be visually clamped at scan level only if the full claim is available through an accessible name and inspector action.
- Multiple occurrences with the same `claim_id` **MUST** remain separate source-local nodes.

### 4. Source/provenance attachment

- Each occurrence card **MUST** show source role and a concise source identity.
- Source provenance **MUST** remain a distinct interactive target from the occurrence body.
- If occurrence status and source status differ, both boundaries **MUST** be distinguishable; the source’s status cannot promote the occurrence.
- URL/domain, retrieval data, hashes, full excerpt/summary boundary, limitations, classification, and inclusion reason **SHOULD** move to source inspector/Sources.

### 5. Relation edge styles

- Only `relation_candidates` **MAY** create claim-relation edges.
- Edges **MUST** connect occurrence IDs, never whole-source nodes.
- Edge type **MUST** be distinguishable without color.
- Directional arrowheads **MUST** be omitted when the selected-axis order is unavailable, equal, or non-chronological mixed precision.
- Same-source relations **MUST** be representable because separate occurrence nodes remove the current source-card self-loop problem.
- `unrelated` candidates **SHOULD** remain in the ledger and inspector rather than drawing a misleading connection in the matrix.

### 6. Relation labels

- Spatial labels **MUST** be short verbs or verb phrases: Replaces, Corrects, Narrows, Responds, Challenges, Supports, Same event, or Unclear.
- A label **MUST** read as line annotation, not an independent data card.
- “Needs review” **MUST** be available in the accessible name and selected/inspector state; it need not be repeated as a large spatial box on every line.
- Full reason and support **MUST** stay in inspector/ledger.

### 7. Unresolved-question endpoints

- Every unresolved question **MUST** appear exactly once in a named Unresolved rail.
- The rail **MUST** sit outside the chronological plot and state “Evidence questions · not conclusions · not chronological records.”
- A question **MUST NOT** receive a date merely because a related record has one.
- One question with multiple related records **MUST** remain one card with multiple origins.

### 8. Context annotations

- A source with no claim occurrence **MUST NOT** be forced into a claim-thread row.
- It **SHOULD** appear in Context annotations with role, title/publisher, source record boundary, and selected-axis time state.
- A context annotation **MUST NOT** become a candidate relation endpoint unless a packet relation actually references a claim occurrence from that source.

### 9. Time unavailable

- Missing selected-axis values **MUST** appear in a separated Time unavailable region.
- That region **MUST** be visually broken from the ordered time scale and omitted from chronological arrow assumptions.
- Stable DOM/order sorting inside the unavailable region **MUST** be described as record order, not time order.

### 10. Day precision

- Day-precision occurrences on one date **MUST** be presented as unordered peers.
- Their layout **MUST NOT** imply an earlier/later relationship within that date.
- If multiple peer cards need deterministic placement, stable ID order **MAY** be used for rendering only and **MUST NOT** be described as chronology.

### 11. Mixed precision

- A date containing instant and day precision **MUST** be labeled Same-day mixed precision.
- Exact instants **MAY** retain clock order inside an exact-instant sub-band.
- Day-level cards **MUST** occupy a peer sub-band.
- A relation spanning an exact instant and day-level peer on that date **MUST NOT** use an arrowhead to claim within-day direction.

### 12. Candidate claim families

- Family rows **MUST** remain explicitly candidate/review-only even when all occurrence records come from the deterministic fixture.
- `grouping_reason` and `grouping_signals` **SHOULD** appear only in family inspector or a compact disclosure.
- `unresolved: true` **MUST** be visible as Grouping unresolved.
- A one-occurrence family **MUST NOT** be described as a demonstrated change sequence.

### 13. Unassigned/ungrouped claims

- The presentation adapter **MUST** cross-check family `occurrence_ids` against occurrence `candidate_claim_family_id`.
- If an occurrence has no family, references a missing family, appears in multiple families, or has inconsistent bidirectional membership, the UI **MUST NOT** auto-cluster it.
- Each such occurrence **SHOULD** receive its own “Ungrouped claim occurrence” row under an Ungrouped band.
- A presentation warning **SHOULD** be available in Method/inspector; no public packet mutation is permitted.

### 14. Selection

- Selecting an occurrence **MUST** open occurrence detail, not silently substitute source detail.
- Selecting a provenance attachment **MUST** open source detail.
- Selecting a relation **MUST** highlight both occurrence endpoints.
- Selecting a question **MUST** highlight its conservative origin anchors.
- Selection **MUST** preserve packet state and **MUST** restore focus and scroll when the inspector closes.

### 15. Thread trace

- Thread trace **SHOULD** highlight all occurrences in the selected candidate family, intra-family relations, direct cross-family relation endpoints, and related unresolved endpoints.
- Other rows **SHOULD** remain visible but dimmed.
- The trace summary **MUST** describe a viewing operation and candidate grouping; it **MUST NOT** say the thread is accepted or true.

### 16. Coverage lenses

- The Map **MUST** preserve a compact count for every source role, including zero and missing target roles.
- Coverage lenses **MAY** highlight baseline/expansion or source roles.
- Lenses **MUST NOT** remove records from the accessibility tree, change relation/family membership, combine packets, or mutate canonical state.
- Method **MUST** remain the primary place for coverage basis, missing-role interpretation, discovery counts, and nonexhaustiveness.

### 17. Inspector transition

- Desktop/tablet inspector **SHOULD** remain nonmodal; mobile inspector **MUST** be modal with focus containment.
- Occurrence detail **SHOULD** show actor, full claim, all four timestamps, uncertainty, support kind/reference, family membership, source attachment, origin, and exact boundary.
- Relation detail **MUST** show the full reason and both support references.
- Family detail **SHOULD** show membership, reason, signals, unresolved state, and review status as family-specific content rather than falling through to generic question detail.

### 18. Relation ledger

- A complete semantic relation ledger **MUST** exist independently of SVG geometry.
- Ledger endpoints **MUST** be occurrence descriptions: actor + concise claim + selected-axis time + source role/title.
- Same-source, parallel, ambiguous-order, unresolved, and unrelated candidates **MUST** remain present.
- On `<=920px`, the ledger **SHOULD** be expanded by default because some cross-thread edges become port references rather than drawn curves.

### 19. Mobile transformation

- Mobile **MUST** preserve the grammar’s entities: candidate thread, occurrence, provenance attachment, candidate relation, context annotation, and Unresolved rail.
- It **MUST NOT** fall back to one global source-card chronology.
- Within each thread, selected time **MUST** run top to bottom with the same unavailable/day/mixed rules.
- Cross-thread relations **MAY** transform into numbered relation chips backed by the complete ledger.

### 20. Accessibility

- The semantic DOM **MUST** contain every occurrence, thread header, context annotation, unresolved question, and relation exactly once for assistive technology.
- SVG paths **SHOULD** be `aria-hidden`; relation meaning **MUST** be in controls/ledger.
- Occurrence accessible names **MUST** include candidate thread, actor, claim, selected-axis time/precision or unavailable state, record boundary, and concise source provenance.
- Relation accessible names **MUST** name both occurrence endpoints, type, review state, and any non-chronological ordering condition.
- The Map **MUST** provide skip targets for Unresolved questions and Candidate relations.
- Local horizontal scroll regions **MUST** be keyboard-focusable only when they actually overflow, must name their analytical content, and must not cause page-level horizontal overflow.
- Responsive alternatives **MUST NOT** expose duplicate accessible copies of the same Map.

## F. Relation visual language

The Map should use **short text + restrained geometry**. Color should encode general state—candidate, selected, dimmed—not semantic type.

| Semantic family | Relation types | Line | Arrow | Short label | Color role |
| --- | --- | --- | --- | --- | --- |
| Transformative update | `supersedes`, `correction`, `narrows` | Solid | Closed arrow only when selected-axis direction is explicit | Replaces, Corrects, Narrows | Common candidate stroke; selected state changes color |
| Responsive sequence | `follow_up` | Long dash | Open arrow only when selected-axis direction is explicit | Responds | Same candidate palette |
| Tension | `contradicts` | Solid with opposing terminal ticks; no arrow | None | Challenges | Same candidate palette; not red-only |
| Reinforcement/context | `corroborates`, `same_event` | Dotted/short dash | None | Supports, Same event | Same candidate palette |
| Indeterminate | `unresolved` | Sparse dots | None | Unclear | Muted candidate palette |
| No direct connection | `unrelated` | No spatial line by default | None | No direct change | Ledger only |

For the prepared case:

- R1 uses a solid line, short **Replaces** label, and a directional arrow on Event time because both occurrence event times are explicit and ordered.
- R2 uses a non-directional tension line with **Challenges**. It does not rely on red and does not turn contradiction into a truth verdict.
- R3 uses a long-dash line, short **Responds** label, and an open arrow on Event time because the endpoints are explicitly ordered.

The spatial label should be plain text on a small canvas-colored knockout, no larger than needed for the verb. “Needs review,” parallel count, endpoint-order caveat, long reason, confidence, and both support excerpts belong in the accessible name, ledger, or inspector. This prevents relation labels from competing with occurrence cards as apparent nodes.

## G. Provenance visual language

An occurrence card should have three scan layers:

```text
[Needs review]  Fictional City Emergency Management Office
The updated guidance corrected listing errors and improved access.
Event time · Jun 14, 2026, 14:15 · exact
Source ▸ Official update · Fictional city updates cooling center list…
          Fictional City Emergency Management Office · Prepared source record
```

The top boundary is the **occurrence** boundary. The source attachment has its own boundary only when needed. In the prepared Jun 14 example, the source snapshot is a prepared canonical fixture record while the claim occurrence is candidate; the design must not collapse those two facts.

At scan level, provenance should contain:

- source role;
- concise source title;
- publisher when it adds identity beyond the actor;
- source boundary when different from the occurrence boundary;
- an affordance that clearly opens source detail.

The following current Map material should move out of the card face:

- domain and external/fixture URL affordance;
- claim/finding/action counts;
- content preview fallback logic;
- snapshot and retrieval status;
- full evidence excerpt or model-generated summary;
- why included, discovery pass, source context, information proximity, classification, comparison targets;
- limitations, hashes, provider identifiers, and exact IDs.

This does not weaken provenance. It gives provenance a stable attachment to the exact claim occurrence and makes the full audit record one explicit interaction away in the source inspector/Sources.

## H. Open-question grammar

Three patterns were considered.

### Bottom question lane

The current pattern keeps questions visible and separate from source lanes, but it makes long vertical connectors, gives cards no meaningful time position, and reads as another graph row rather than the endpoint of incomplete evidence.

### Inline question endpoints

Putting a question immediately after an occurrence makes local context strong. It also risks making the question look like a later chronological record, scatters the complete list, and duplicates a question linked to multiple records.

### Per-thread unresolved sections

Per-thread sections make review convenient, but candidate families are not accepted taxonomy. Action/source-linked and multi-thread questions do not always belong to one claim row. Assigning them to a row could add semantics the packet does not contain.

### Recommendation: one Unresolved rail

Use one named rail outside the time grid. It says:

> Unresolved evidence questions · not conclusions · not chronological records

Each question appears once. Its origin is expressed conservatively:

1. Related occurrence ID → occurrence anchor.
2. Related actor claim ID → all matching source-local occurrence anchors; if none, its known source anchor(s).
3. Related source ID → provenance anchor(s) or context annotation.
4. Related action ID → source provenance anchor(s), explicitly labeled “via action record”; never the occurrence body.
5. Unknown ID or no reference → topic-level evidence gap with no invented source edge.

A multi-origin question receives multiple thin dashed tethers on wide desktop or multiple origin chips on narrower layouts. Tethers use no arrowhead and the label **Evidence gap**, clearly distinct from candidate claim relations. The rail position is an endpoint convention, not a claim that the question occurs after the latest date.

## I. Coverage role after removing source lanes

Source-role information moves to four coordinated places:

1. **Compact Map coverage strip:** every role and count, including zeros; missing target roles visibly marked.
2. **Occurrence provenance badge/context annotation:** the role of the supporting source at the point of use.
3. **Coverage lenses:** non-destructive highlights for baseline/expansion and role-oriented review.
4. **Method and Sources:** complete coverage basis, discovery/pass metrics, missing-role explanation, why included, source context, and limitations.

The prepared strip should read approximately:

```text
Coverage · prepared fixture
Official & established 1 | Original records 0 — missing | Local & firsthand 1
Specialist context 1 | Challenges & corrections 1
```

On live packets, the strip may additionally show Standard or Coverage expansion as the basis, but must not claim exhaustive coverage. Selecting a role dims nonmatching occurrences and context annotations; it does not remove them or change candidate relations.

## J. Responsive transformation

Desktop and mobile use the same entities and boundaries. Only geometry changes.

### `>1200px` — full matrix

- Three aligned regions: `220px` sticky thread headers; flexible time matrix; `280–320px` Unresolved rail.
- The prepared case should fit without horizontal scrolling at common wide widths. Dense/many-date packets may scroll **inside the time matrix only**.
- Date headers and thread headers remain sticky within their local scroll axes.
- All three prepared relations are drawn. Long reasons stay out of the canvas.
- Context annotations form a strip below thread rows. Their unavailable region aligns with the matrix’s unavailable column.
- The focused inspector remains a nonmodal side panel. Selection scrolls the occurrence into view before opening, but the panel must not reset the matrix’s horizontal position.

### `921–1199px` — compact matrix with analytical scroll

- The matrix remains a matrix; it does not become a global source list.
- Thread headers narrow to approximately `168–184px` and remain sticky.
- The time plane uses contained horizontal scrolling with a visible, conditional hint and Left/Right/Home/End keyboard support only when measured overflow exists.
- The Unresolved rail moves below the matrix as a full-width bordered section with a two-column card grid when space permits. Origin tethers become labeled origin chips because the rail is no longer aligned beside the rows.
- Context annotations stay between the matrix and Unresolved section.
- Relation lines remain visible inside the matrix. If density mode activates, cross-thread relations use numbered ports and the ledger.
- Inspector remains nonmodal, fixed or docked, with selection/scroll restoration.

### `<=920px` — thread chapters

- The spatial matrix transforms into one section per candidate thread, not one global time-ordered list of source cards.
- Each thread header shows candidate state, occurrence count, and grouping uncertainty.
- Selected time runs top to bottom inside the thread. Day/mixed/unavailable rules remain explicit.
- Intra-thread relations render between occurrence cards. Cross-thread relations become numbered chips on both endpoints and complete entries in the relation ledger.
- Context annotations follow all thread chapters in a distinct section.
- The Unresolved rail follows Context as a distinct terminal section and retains the same heading and one-card-per-question rule.
- The relation ledger follows or precedes Unresolved through a visible jump link; it is expanded by default.

### Mobile around `390px`

- One content column, no page-level horizontal scroll.
- Occurrence card order: boundary + actor; full/expandable claim; selected-axis time; provenance attachment.
- Relation chips are full-width or wrap safely and name the other occurrence by actor + short claim, never only an ID.
- Coverage starts as `4 sources · 4 of 5 target roles represented`; an accessible disclosure reveals every role/count and the missing Original records role.
- Thread identity remains visible at each section start; a compact sticky local heading MAY be used only if it does not obscure focus targets.
- The inspector uses the existing modal model, focus containment, Escape close, and focus/scroll restoration.

### Narrow mobile around `360px`

- Actor, state, and source-role badges stack rather than squeeze.
- Controls become full-width with at least `44px` targets.
- Source title and publisher wrap to two compact lines; no domain/ID is shown on the card face.
- Coverage remains a disclosure rather than a horizontally scrolling chip strip.
- Question origin chips stack beneath the question text.
- The modal inspector uses a small viewport inset and internal scrolling; the underlying page remains fixed.

### Horizontal scrolling policy

Horizontal scrolling is an analytical tool only at matrix widths above 920px. It belongs to the time plane, must have a conditional visible/accessible hint, and must preserve sticky thread identity. Below 920px, the thread-chapter transformation removes the need for horizontal analysis. At no width may the page itself overflow horizontally.

## K. Implementation impact without implementation

### `InvestigationMapView`

Likely presentation changes:

- Replace source-lane/source-card rendering with thread rows and occurrence cards.
- Add compact coverage strip, context annotations, Time unavailable region, and Unresolved rail.
- Change selection targets so the occurrence body opens `claim_occurrence`; provenance opens `source`; row header may open `claim_family`.
- Keep SVG decorative and make relation controls smaller line annotations.
- Preserve conditional local scroll, focus restoration, coverage highlighting, and responsive inspector semantics.
- Replace the current `<=920px` source chronology with thread chapters.

### `investigation-map` derivation

A new internal derived-view model would likely need:

- `InvestigationClaimThread`;
- `InvestigationOccurrenceNode` with selected-axis value/precision/region;
- `InvestigationSourceAttachment`;
- `InvestigationContextAnnotation`;
- occurrence-to-occurrence relation endpoints;
- `InvestigationUnresolvedEndpoint` with typed origin anchors;
- family-membership diagnostics and ungrouped rows;
- density/routing metadata that never changes the packet.

The derivation should use occurrence time fields directly. It should keep a source index for provenance and context annotations. Coverage and trace functions can remain pure derived viewing operations.

### Contracts

**No public packet/schema/API change is required to implement v1.** The existing packet provides occurrence text/actor/time/status/source/support/family, candidate family membership/reason/signals, candidate relation endpoints/type/reason/support, source snapshots/roles/coverage, actions/findings, and unresolved related IDs.

The current `candidate_claim_families` are sufficient for **candidate row membership**, but insufficient for reliable public thread identity:

- there is no human-readable family label;
- every family remains `pending_review` and candidate;
- one-occurrence families may be explicitly unresolved;
- the interface does not carry a reviewed row order;
- the schema records both family `occurrence_ids` and occurrence `candidate_claim_family_id`, but the visible contract validation does not establish a presentation guarantee of unique, bidirectionally consistent membership.

Therefore v1 must use neutral row numbering, show candidate uncertainty, and fail closed to one ungrouped row per inconsistent occurrence. It must not infer a label from normalized text or stable IDs.

### CSS/layout

- Introduce a sticky-row-header + time-plane grid.
- Use date-group columns rather than one column per source.
- Add a non-chronological unavailable column and right/stacked Unresolved rail.
- Route occurrence-level edges in per-row channels; reserve cross-row channels outside card bodies.
- Define a density mode for more than roughly 12 visible relations, repeated parallel edges, or collision failure: retain all relations in the ledger while showing selected/intra-thread edges and numbered cross-thread ports.
- Preserve reduced-motion behavior and measured-overflow focusability.

The exact density threshold should be validated against the existing 3/5/8-source fixtures rather than treated as epistemic logic. It is a presentation threshold only.

### Inspector

- Expand occurrence detail to include all four timestamps, family membership, uncertainty, support, source attachment, and record boundaries.
- Add a family-specific detail body.
- Change relation endpoint summaries from source titles to occurrence actor/claim/source summaries.
- Preserve source/action/finding separation and the model-summary-versus-captured-text boundary.
- Preserve desktop nonmodal/mobile modal behavior and exact focus restoration.

### Relation ledger

- Keep all current relation IDs/support/detail behavior.
- Render occurrence endpoints and selected-axis order basis.
- Include same-source relations spatially where possible and always in the ledger.
- Include `unrelated` in the ledger even when omitted from spatial geometry.
- Make numbered port identity available for tablet/mobile/density mode.

### Mobile path

- Replace `map.sources.map(...)` global order with candidate-thread sections built from occurrence nodes.
- Keep context-only sources outside those sections.
- Convert cross-thread relations to two endpoint ports + one ledger row.
- Keep Unresolved as a final rail, not ordinary cards mixed into a thread chronology.

### Tests

Tests should prove:

1. Pure deterministic derivation and no packet mutation.
2. Every occurrence is rendered exactly once in a family or individual ungrouped row.
3. Inconsistent/missing/duplicate family membership fails closed without auto-clustering.
4. Relation endpoints remain exact occurrence IDs; no source projection occurs.
5. Same-source and parallel relations remain represented.
6. Each selected axis uses only its matching occurrence/source value.
7. Missing, day, and mixed precision never gain artificial order or arrowheads.
8. Context-only sources remain visible and never become claim nodes.
9. Source/claim/action/occurrence/unknown question origins resolve conservatively; multi-origin questions appear once.
10. Coverage strip preserves every role/count/zero and lenses do not remove or mutate material.
11. Prepared/live/fallback packets use one presentation grammar while retaining their boundaries.
12. 3/5/8-source density fixtures preserve all material; the existing 5-source 10-relation and 8-source 18-relation cases remain reviewable through density mode and ledger.
13. Semantic DOM, accessible names, skip targets, keyboard scroll, inspector focus loop, Escape, and focus/scroll restoration.
14. `>1200`, `921–1199`, `<=920`, `390`, and `360` layouts have no page-level horizontal overflow and retain the same entities.

### Can implement now using the current packet

- occurrence primary nodes;
- two prepared candidate rows and a generic ungrouped fallback;
- all four selected axes on occurrences;
- current three occurrence-level relations;
- current three unresolved questions with typed conservative origins;
- source role/title/publisher attachments;
- current coverage counts/lenses;
- editorial context annotation with Event time unavailable;
- occurrence/source/relation/question inspector transitions;
- desktop matrix, tablet contained scroll, and mobile thread chapters.

### Desirable later data/model improvements

These are optional later improvements, not prerequisites and not part of this UI task:

- a reviewed, human-readable candidate-family display label;
- explicit reviewed family identity/order distinct from candidate grouping;
- contract-level bidirectional/unique family-membership validation;
- explicit question origin type/target IDs so action/source/occurrence resolution need not be reconstructed in presentation;
- explicit relation semantic direction separate from chronological left/right ordering;
- optional reviewed context-annotation classification.

None should be smuggled into the initial production Map redesign.

## L. Implementation risks and mitigations

| Risk | Failure if ignored | v1 mitigation |
| --- | --- | --- |
| Sparse claim-family data | Rows look empty or falsely authoritative | Neutral candidate row labels; one-occurrence state; ungrouped fallback |
| One-claim families | A single point looks like demonstrated lineage | “Single occurrence · no change sequence”; no continuation rail beyond actual edges |
| Overlapping relations | Labels/cards obscure claims | Short line labels, reserved channels, collision checks, density mode, complete ledger |
| Many sources | Provenance repeats and canvas widens | Sources do not define columns; compact attachments; context strip; max-8 coverage still visible |
| Many claims | Excessive row/card height and tab stops | Thread sections, bounded visual clamp with full accessible text/inspector, density controls; never silently drop nodes |
| Long claim text | Cards dominate and edges route around prose | Concise clamped scan text plus explicit full-claim inspector; preserve full accessible name |
| Relation crossings | Interaction pattern becomes unreadable | Intra-row routing first; stable cross-row channels; numbered ports/ledger above density threshold |
| One source with multiple claims | Source-card endpoint is ambiguous | Separate occurrence nodes sharing one provenance attachment identity |
| One claim linked to multiple sources | Merging loses source-local support differences | Separate occurrences per source; optional exact `claim_id` sibling indicator; never merge support |
| Context-only sources | Forced fake claim/time node | Context annotation and exact-axis unavailable state |
| No explicit event time | Another date gets substituted | Dedicated Time unavailable region on Event time; no arrow based on placement |
| Question linked to multiple records | Duplicate questions or false single-thread assignment | One rail card with multiple typed origin anchors/chips |
| Action-linked question | Action is visually turned into a claim | Attach to source provenance anchor labeled “via action record” |
| Family membership inconsistency | Presentation invents grouping | Cross-check both directions; isolate each affected occurrence in ungrouped row |
| Mixed/day precision | Layout invents within-day chronology | Exact sub-band + unordered day-peer band; suppress temporal arrowhead |
| Equal retrieval times | Stable order is misread as chronology | Shared-time peer group; explicit equal-time/record-order copy; no arrow based on X |
| Mobile density | Relation chips and provenance overwhelm the path | Thread chapters, full-width targets, cross-thread ledger, collapsed coverage disclosure, modal inspector |
| Candidate/canonical conflation | Canonical source appears to canonize candidate claim | Separate occurrence and source boundary labels; occurrence boundary is primary |
| Model summary conflation | Summary appears to be captured source text | Keep content-kind boundary in source attachment/inspector and Sources; never quote it as source page text |

## M. Recommendation

Adopt **Alternative 1, the Temporal Claim-Lineage Matrix**, for independent design approval before implementation.

It is superior to the current source-role swimlane because the two coordinates and the edge semantics all answer the same primary question. X means selected time. Y means provisional claim thread. Nodes mean source-local claim occurrences. Edges mean candidate occurrence relations. The user can follow one kind of thing—claim occurrences—through change and interaction.

The design preserves the best parts of the current Map:

- explicit time-axis choice and no substitution;
- day/mixed precision honesty;
- source roles and coverage gaps;
- exact candidate relations and support inspection;
- visible open questions;
- non-mutating lenses and traces;
- complete relation ledger;
- focused inspector and responsive accessibility model;
- prepared/live/fallback and candidate/canonical boundaries.

Information that moves out of the primary canvas includes full source-card identity, counts, long previews, URLs, domain, snapshot mechanics, coverage methodology, long relation reasoning, support excerpts, and findings/actions. Those remain in Sources, Method, ledger, and inspector.

Information that becomes more prominent includes actor claim text, claim occurrence status, candidate thread membership/uncertainty, occurrence-to-occurrence relation semantics, exact selected-axis placement, and unresolved evidence endpoints.

A user should understand faster:

1. There were three claim occurrences, not four equivalent source nodes.
2. The Jun 10 and Jun 14 city claims form one candidate change thread.
3. The Jun 12 community claim is a distinct unresolved grouping that challenges the initial claim and is followed by the update.
4. The editorial record is context, not another claim in the lineage.
5. The three questions remain unresolved evidence needs, not later events or conclusions.
6. Every relation still needs review and every occurrence remains source-bound.

The remaining tradeoffs are real. Candidate families do not yet provide trusted public names. Cross-thread edges can become dense. A matrix above 920px needs contained horizontal scrolling for larger packets. Mobile cannot preserve every cross-row curve and must rely more heavily on relation ports and the ledger. These costs are preferable to retaining a source-role coordinate that obscures the product’s core claim-lineage purpose.

## N. Independent-review gate

**Do not implement the production redesign from this document without a separate authorization after independent design review.**

The reviewer should specifically decide:

1. Is a candidate-family row an acceptable primary Y organization when row labels remain neutral and unresolved?
2. Does the right-side Unresolved rail clearly communicate evidence questions rather than conclusions or chronological records?
3. Are action-linked question origins sufficiently clear when attached to source provenance rather than claim bodies?
4. Is the proposed relation language restrained enough, especially the non-directional Challenges style and selected-axis arrow suppression?
5. Should dense cross-thread relations switch to numbered ports at a tested threshold, or should the product prefer Alternative 2 by default?
6. Does the mobile thread-chapter path preserve the same grammar strongly enough without spatial cross-thread curves?
7. Is the scan-level provenance attachment sufficient for auditability while full source mechanics move to inspector/Sources?

Requested outcome: independent design review of this proposal only. Production application code changed in this proposal: **0 files**. Provider/API/hosted/Sites/D1 state changes: **0**.
