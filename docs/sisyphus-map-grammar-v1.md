# Sisyphus Watch Map Grammar v1

**Status:** Design-only application proposal for independent review

**Authoritative starting `main`:** `d1fb616bdcb8fb9fc957351e008c8817cb472102`

**Scope:** Presentation and derived-view architecture only

**Production implementation in this change:** None

This document proposes an information-display grammar for the Sisyphus Watch Map. It does not authorize or implement a production Map redesign, packet/schema/API changes, provider work, hosted work, a Sites Version, deployment, or D1 mutation.

The recommendation is a **Temporal Claim-Lineage Matrix with Adaptive Relation-Summary Mode**: selected time on the horizontal axis, explicit claim-row types on the vertical axis, source-local claim occurrences as the primary nodes, candidate occurrence-to-occurrence relations as edges or synchronized ports, source provenance attached to each occurrence, non-claim source records as annotations, and a visibly non-chronological Unresolved rail as the endpoint.

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
| Non-claim source records | 1 editorial/opinion source with no claim occurrence; presented as Context / interpretation |

The source-role coverage record is: Official & established `1`; Original records `0`; Local & firsthand `1`; Specialist context `1`; Challenges & corrections `1`. The absent Original records role is real coverage information, not a rendering error.

### Exact prepared material used in the proposal

The proposal and wireframes use these packet records without substituting or inventing content:

| Occurrence | Actor claim text | Event / assertion / publication time | Source provenance |
| --- | --- | --- | --- |
| Initial city availability | “Residents could find safe, air-conditioned spaces across the city.” | Jun 10 09:00 / Jun 10 09:00 / Jun 10 09:00 | Official notice — “Fictional city announces cooling centers for severe heatwave” |
| Community practical access | “Several listed cooling centers were not practically accessible.” | Jun 12 12:00 / Jun 12 18:30 / Jun 12 18:30 | Community report — “Volunteer network reports practical access issues at listed cooling centers” |
| Later city corrected/update | “The updated guidance corrected listing errors and improved access.” | Jun 14 14:15 / Jun 14 14:15 / Jun 14 14:15 | Official update — “Fictional city updates cooling center list and adds transport support” |

The fourth source, “Opinion note on emergency communication and street-level access,” is a **non-claim source record** because it has no claim occurrence. Its available packet metadata supports the presentation subtype **Context / interpretation**. It has no event time; its publication time is Jun 15 08:00 and retrieval time is Jun 15 12:00. When Event time is selected it must appear as **Unplaced on Event time**, while the other timestamps remain inspectable.

The three current candidate relations are:

1. `supersedes`: left endpoint initial city occurrence; right endpoint later city update occurrence.
2. `contradicts`: endpoints initial city occurrence and community access occurrence; non-directional in v1.
3. `follow_up`: left endpoint community access occurrence; right endpoint later city update occurrence.

The engine produced those left/right endpoints through its time/record ordering chain; the packet has no separately reviewed semantic-direction field. R1/R3 arrowheads therefore remain conditional on the composite selected-axis rule, not on this listing. All three are `pending_review` candidate records. The exact current unresolved questions are:

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

The time treatment is also disciplined. The Map exposes all four axes, keeps missing values separate, groups same-calendar-day mixed precision, and removes a relation arrowhead when its current endpoint-order basis is non-chronological mixed precision. The shared Timeline applies the same no-substitution principle. The current **source-node** initial-axis derivation can treat occurrence, action, or time-candidate values as evidence that a source has Event time; the occurrence-primary proposal intentionally changes that presentation rule so only primary claim occurrences decide the initial axis.

The current relation layer preserves each candidate relation and its exact occurrence IDs, source IDs, type, review state, reason, support references, parallel-relation identity, and lineage-row link. The accessible relation ledger prevents the SVG from being the only representation. Same-source relations remain in packet/detail/ledger even though their degenerate source-card self-loop is omitted spatially.

The current Map also succeeds in making open questions visible and explicitly labeling them “not conclusions.” Coverage lenses and thread tracing are viewing operations only. The focused inspector preserves scroll and focus, is nonmodal on desktop, becomes a focus-contained modal at mobile width, and keeps long support, provenance, limitation, timestamp, and technical material out of the card face.

### Where source-role lanes help

Source-role lanes answer a legitimate secondary question: “What kinds of sources are represented?” They make official/established material, original records, local/firsthand observations, specialist context, and challenges/corrections visually separable. They also make a missing target role visible. In the prepared case, the empty Original records lane is an honest representation of a coverage gap.

The lanes are useful when the reviewer is auditing diversity and provenance. They prevent an official update from visually masquerading as a community report, and they reveal that the editorial record is analysis/commentary rather than a factual claim occurrence.

### Where source-role lanes hurt claim-lineage readability

The vertical coordinate answers a provenance question while the edges answer a claim-lineage question. Those encodings compete.

- The two city occurrences belong to the same candidate family, but their sources sit in different lanes: Official & established and Challenges & corrections.
- The community occurrence belongs to a separate unresolved one-occurrence family, but its challenge and follow-up relations cross between that row and both city source rows.
- The editorial Context / interpretation record has no claim occurrence and no event time, yet still occupies a source card, a specialist lane, and a time column.
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

The card’s preview can be an actor claim, finding, action, interpretation, or source summary depending on what the source contains. Its semantic type therefore changes from card to card. A source may contain multiple claims, one claim may appear in multiple sources as separate occurrences, and two claim occurrences may exist in one source. Projecting occurrence-level relations onto a source card obscures all three cases. The existing same-source relation test makes this concrete: the relation remains valid packet data, but the spatial source-card self-loop cannot express it.

Likewise, “no claim occurrence” does not mean “context.” Such a source may carry findings, actions, interpretation, source evidence/summary without a structured claim, or a mixture. The prepared editorial source is a Context / interpretation example; it must not define the generic no-occurrence category.

The primary Map node should be the **claim occurrence**: a source-local instance of an actor claim with its own selected-axis times, status, support reference, source ID, and candidate-family membership.

### How unresolved questions fit—and conflict—with the current coordinates

Open questions are not ordinary chronological records, but the current bottom lane places them inside the same spatial stage as time columns, source lanes, and relation edges. They have no meaningful X coordinate and are spread across a three-card grid. Their dashed source/topic connectors can be mistaken for another relation class even though they mean only “related evidence gap.”

The current wording correctly says they are visible endpoints and not conclusions. The coordinate system does not fully deliver that promise. A separate Unresolved rail should retain the endpoint metaphor while explicitly sitting outside the chronological plane.

### Scan level versus inspector level

The Map scan level should contain only what is needed to follow claim change:

- exact row type—Candidate thread, Standalone claim occurrence, or Ungrouped claim occurrence—and its uncertainty;
- actor;
- concise claim text;
- selected-axis time and precision state;
- plain-language occurrence review/prepared-record boundary;
- a compact source role + source title/publisher attachment;
- short candidate relation label and visible review state;
- unresolved question text and its conservative origin type;
- a compact subtype label for each non-claim source record;
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

This is the recommended low-density grammar and the default presentation mode.

- **Primary user question:** How did source-local public claims change, interact, get challenged, get replaced, or remain unresolved over the selected time axis?
- **X axis:** The explicitly selected Event, Publication, Actor assertion, or Sisyphus retrieval time. For packets with primary claim occurrences, initial selection uses the first axis with any explicit occurrence value in this order: Event, Publication, Actor assertion, Retrieval. With zero primary occurrences, it uses Publication when any source/non-claim record has an explicit Publication value, otherwise Retrieval. This chooses a view only; no record borrows another time meaning.
- **Y organization:** Three explicit row types: an internally consistent multi-occurrence family is **Candidate thread · N occurrences · needs review**; a one-occurrence unresolved family is **Standalone claim occurrence · grouping unresolved**; missing or inconsistent membership is **Ungrouped claim occurrence**. Only the first is called a thread. One packet-local row ordinal is derived from the initial axis and stable tie-breaks, then remains fixed across axis changes.
- **Primary node type:** Claim occurrence.
- **Source provenance:** A compact provenance attachment inside the occurrence card: source role, short source title/publisher, and source record boundary when it differs from the occurrence boundary. It opens the source inspector.
- **Relation representation:** In **Matrix mode**, readable intra-thread and cross-row candidate relations may draw directly between occurrence anchors. In adaptive **Relation-summary mode**, useful intra-thread and selected relations may remain spatial while cross-row relations use numbered ports. Both modes use the same **Complete relation review ledger** and remove no candidate relation record.
- **Open-question representation:** One right-side Unresolved rail outside the chronological grid. One question card may contain multiple typed origins: occurrence, actor claim, action, source, or topic/unknown. Only occurrence and matching-claim origins draw occurrence tethers by default.
- **Non-claim source-record representation:** A named section outside claim rows contains sources with no occurrence. Derived presentation subtypes are Context / interpretation, Action-bearing source, Finding-bearing evidence source, Source-only record, and Mixed non-claim source. The section has **Dated on [selected axis]** and **Unplaced on [selected axis]** subgroups. Explicit values use deterministic temporal grouping/order; axis changes may move a record between subgroups without changing identity or subtype. These records never enter occurrence relation geometry. The prepared editorial source is Context / interpretation.
- **Time-unavailable behavior:** Missing selected-axis values appear in a non-chronological band below the dated matrix, labeled **Unplaced on Event time**, **Unplaced on Publication time**, and so on. It is not a later column; other timestamps remain inspectable; no arrow direction may be inferred through it.
- **Mixed/day precision behavior:** One date band. Exact instants receive ordered subcolumns. Day-level records occupy a peer sub-band with no left/right order. Relations involving a day-level peer and an exact instant on that date do not receive a temporal arrowhead.
- **Claim-family uncertainty:** Multi-occurrence internally consistent rows say Candidate thread and Needs review. The prepared one-occurrence community family is a Standalone claim occurrence with Grouping unresolved, not a thread or demonstrated sequence. Family IDs are never parsed into public labels.
- **Selected/focused behavior:** Selection highlights the occurrence, its typed row, direct relation endpoints, and related unresolved endpoints while retaining other material in a dimmed state. Axis changes preserve the packet-local row ordinal, selection, and vertical row position while cards move horizontally or into/out of Unplaced. The occurrence inspector opens; source provenance remains a distinct target.
- **Coverage lens behavior:** A compact coverage strip preserves every role and zero count. Lenses highlight matching provenance attachments, occurrences, non-claim source records, and related endpoints; they do not filter, delete, merge, or accept records.
- **Relation ledger role:** Exactly one authoritative semantic entry per `relation_id`, presented publicly in the **Complete relation review ledger**, in both density modes. It includes same-source, parallel, ambiguous-order, unresolved, and unrelated candidates. A visual edge or numbered port is only a synchronized shortcut to that entry.
- **Desktop composition:** Sticky typed row headers in the packet-local fixed ordinal; scroll-contained dated matrix; non-chronological claim-occurrence Unplaced band; aligned Unresolved rail; Non-claim source records with Dated/Unplaced subgroups; then Complete relation review ledger.
- **Tablet composition:** Sticky narrower row headers preserve the packet-local ordinal while the time plane scrolls horizontally. The Unresolved rail moves below the matrix but remains a bordered, named endpoint region with typed origin chips; occurrence Unplaced and non-claim Dated/Unplaced regions remain distinct.
- **Mobile composition:** Typed vertical chapters retain the packet-local row order: Candidate thread, Standalone claim occurrence, or Ungrouped claim occurrence. Occurrences run top to bottom inside their chapter; intra-thread relations may sit between cards; cross-row relations use numbered shortcuts backed by the complete review ledger. Non-claim source Dated/Unplaced subgroups and Unresolved remain distinct sections.
- **Screen-reader/keyboard representation:** Semantic sections use the exact row type and stable packet-local DOM ordinal in their names/navigation order. Neutral `T01`-style numbering is display-local, not a stable identity. SVG paths are decorative. Every relation is reachable through its authoritative relation-review entry; any focusable edge/port shortcut names the same candidate relation and its review/detail target. Skip links reach Unresolved and Candidate relations. Inspector close restores focus and scroll.
- **Strengths:** Directly answers the product question; makes current occurrence and family records useful without overstating one-occurrence groupings; preserves provenance without letting it dominate; supports same-source relations; adapts to dense relations without loss; keeps questions outside chronology; retains coverage transparently.
- **Weaknesses:** Candidate families are sparse and unlabeled; cross-row edges can still cross in Matrix mode; the matrix needs a robust ungrouped path; tablet requires contained horizontal scrolling; relation-summary ports reduce at-a-glance network shape.
- **Failure modes:** Treating a candidate family or relation review ledger as accepted public truth; calling a one-occurrence family a thread; inventing family names from IDs; opening an all-Unplaced axis despite another explicit occurrence axis; vertically reordering rows on an axis change; treating display-local `T01` as stable identity; inferring semantic direction from left/right IDs or position; silently simplifying edges; attaching action/source-linked questions to arbitrary claim bodies; forcing a non-claim source into a context label or claim geometry it does not support.
- **Expected complexity with the current code/data:** Medium-high presentation refactor. The packet is sufficient for typed rows, occurrence nodes, provenance, relations, current questions, derived non-claim records, time axes, coverage, and both relation-density modes. No public schema/API change is required.

#### Prepared cooling-center case in low-density Matrix mode

`T01` below is neutral presentation numbering assigned from this displayed packet’s fixed row ordinal. It is not a parsed family ID, reviewed topic label, public/export identity, or stable identity across packets. The prepared community family is deliberately not assigned a `T02` thread label.

```text
MAP · selected axis: EVENT TIME
Initial-axis basis: at least one primary claim occurrence has explicit Event time
Rule: explicit Event values only; no publication/assertion/retrieval substitution
ROW ORDER: fixed for this displayed packet; changing axes does not reorder rows

CANDIDATE RELATIONS · spatial labels name relation types requiring review,
NOT accepted facts.  MODE: Matrix · 3 of 3 relations in Complete relation review ledger.

COVERAGE  Official & established 1  |  Original records 0 MISSING
          Local & firsthand 1       |  Specialist context 1
          Challenges & corrections 1

TIME →                         Jun 10, 09:00       Jun 12, 12:00       Jun 14, 14:15       UNRESOLVED RAIL
                                                                                           Evidence questions
Candidate thread T01                                                                       Not conclusions
2 occurrences · needs review                                                              Not chronological
                              ┌──────────────────┐                      ┌──────────────────┐
                              │ City EMO         │  Replaces [R1]      │ City EMO         │
                              │ Safe, air-       │────────────────────▶│ Corrected listing│
                              │ conditioned      │                      │ errors; improved │
                              │ spaces citywide  │                      │ access           │
                              │ Event Jun 10     │                      │ Event Jun 14     │
                              │ Prepared case    │                      │ Needs review     │
                              │ record           │                      │                  │
                              │ Official notice │                      │ Official update  │
                              │ Prepared source  │                      │ Prepared source  │
                              │ record           │                      │ record           │
                              └────────┬─────────┘                      └────────▲─────────┘
                                       ╲ Challenges [R2] — NO ARROW             ╱ Responds [R3]
                                        ╲                                      ╱
Standalone claim occurrence              ╲        ┌──────────────────┐         ╱
grouping unresolved                       └───────┤ Volunteer Network├────────▶
                                                     │ Not practically │
                                                     │ accessible      │·········· Q1
                                                     │ Event Jun 12    │           How representative?
                                                     │ Prepared case   │           Via actor claim →
                                                     │ record          │           matching occurrence
                                                     │ Community report│
                                                     │ Prepared source │
                                                     │ record          │
                                                     └──────────────────┘

                                                                                           Q2  Did transport support
                                                                                               reach residents in time?
                                                                                               Via action record:
                                                                                               “Added free shuttle support”
                                                                                               Source: Official update

                                                                                           Q3  Durable update process?
                                                                                               Via action record:
                                                                                               “Published updated list and
                                                                                               clarified opening hours”
                                                                                               Source: Official update

NON-CLAIM SOURCE RECORDS · outside claim rows · never claim-relation endpoints
DATED ON EVENT TIME
(none in the prepared packet)

UNPLACED ON EVENT TIME · NON-CHRONOLOGICAL SUBGROUP · not after Jun 14
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Context / interpretation · Opinion note on emergency communication and street-level access│
│ Source role: Specialist context · Event time absent                                     │
│ Publication Jun 15 08:00 and Retrieval Jun 15 12:00 remain inspectable                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘

COMPLETE RELATION REVIEW LEDGER
R1 Replaces · candidate / needs review · arrow shown only after composite rule passes
R2 Challenges · candidate / needs review · non-directional; no arrow
R3 Responds · candidate / needs review · arrow shown only after composite rule passes
```

For this selected axis, R1 and R3 are eligible for arrowheads only because their types are in documented directional families, both endpoint Event values are explicit, those values have strict chronological order, and that earlier-to-later order agrees with the relation record’s left/right endpoint order. R2 is a contradiction/challenge relation and therefore remains non-directional. If any eligibility condition changes on another selected axis, the same line and label remain but the arrowhead disappears and the ledger says **Direction not asserted on the selected axis**.

Q1’s actor-claim origin resolves to the matching community occurrence, so an occurrence tether may be drawn. Q2 and Q3 have action origins; each uses a **Via action record** chip containing concise action and source identity, with no tether to the Jun 14 claim body or its provenance attachment. The editorial source remains visible as a Context / interpretation subtype without pretending it is a claim occurrence or inventing an Event time.

The **Prepared case record**, **Prepared source record**, and **Needs review** labels are the primary public record-boundary wording. Raw status values may remain in technical detail, but public labels do not verify truth, endorse a source, or promote any candidate family/relation.

#### Publication-time placement of the prepared non-claim source

Changing the selected axis moves the same editorial source between non-claim placement subgroups without changing its Context / interpretation subtype or source identity:

```text
NON-CLAIM SOURCE RECORDS · selected axis: PUBLICATION TIME

DATED ON PUBLICATION TIME
Jun 15, 2026, 08:00
┌──────────────────────────────────────────────────────────────────┐
│ Context / interpretation                                         │
│ Opinion note on emergency communication and street-level access │
│ Prepared source record                                           │
│ Not a claim occurrence                                           │
│ Never a claim-relation endpoint                                  │
└──────────────────────────────────────────────────────────────────┘

UNPLACED ON PUBLICATION TIME
(none in the prepared packet)
```

The explicit Publication value determines ordering only inside **Dated on Publication time**. This record never enters a claim row or occurrence relation geometry.

#### Compact Relation-summary mode example

The current three-relation fixture should normally stay in Matrix mode. This forced compact transformation shows the same topology so reviewers can evaluate the adaptive grammar; a real switch is based only on validated presentation density/collisions/available width.

```text
Spatial overview simplified · all 3 candidate relations remain listed below

Candidate thread T01 · 2 occurrences · needs review
[City Jun 10 · Official] ── Replaces [R1] ──▶ [City Jun 14 · Official update]
        port [R2]                              port [R3]

Standalone claim occurrence · grouping unresolved
[Community Jun 12 · Community report]  ports [R2] [R3]

Complete relation review ledger — no candidate relation removed
[R1] City Jun 10 — Replaces → City Jun 14       Candidate · needs review
[R2] City Jun 10 — Challenges — Community Jun 12 Candidate · no direction asserted
[R3] Community Jun 12 — Responds → City Jun 14   Candidate · needs review
```

### Alternative 2 — Typed claim-row small multiples + provenance/relation ledger

This alternative removes cross-row line routing from the primary canvas. It is a hybrid lineage + ledger grammar, not a cosmetic matrix variant.

- **Primary user question:** What changed within each candidate claim grouping, and which candidate connections require review across rows?
- **X axis:** Selected time, independently but consistently scaled across every small-multiple row. Initial selection uses the same occurrence-primary Event → Publication → Actor assertion → Retrieval chain as Alternative 1, with the zero-occurrence Publication → Retrieval source-record fallback. No time meaning is substituted.
- **Y organization:** Typed small multiples: multi-occurrence Candidate thread rows, one-occurrence Standalone claim occurrence rows, and individual Ungrouped claim occurrence rows. Their ordinal is fixed from the initial axis for the lifetime of the displayed packet.
- **Primary node type:** Claim occurrence.
- **Source provenance:** The same compact role/title/publisher attachment as Alternative 1, with a source-detail target.
- **Relation representation:** Intra-thread relations draw directly between occurrences. Cross-row relations appear as matching numbered ports on their two occurrence cards and as full entries in an adjacent relation ledger. No cross-row curve is drawn.
- **Open-question representation:** A small unresolved endpoint well at the end of a row only for occurrence or matching actor-claim origins. Action, source, topic/unknown, and multi-origin questions remain one card each in a global Unresolved panel with typed origin chips.
- **Non-claim source-record representation:** A source-record section below the claim rows, grouped by subtype and subdivided into **Dated on [selected axis]** and **Unplaced on [selected axis]**. Dated records use deterministic temporal grouping/order but never relation ports or claim-row geometry without an occurrence. Axis switches may move a record between subgroups without changing identity/subtype.
- **Time-unavailable behavior:** A shared non-chronological **Unplaced on [selected axis]** band below the dated small multiples; other timestamps stay in inspector. It is not a later column and no arrow is inferred through it.
- **Mixed/day precision behavior:** Same date-band rules as Alternative 1; each row uses peer clusters for day-level occurrences.
- **Claim-family uncertainty:** Multi-occurrence consistent rows say Candidate thread · N occurrences · needs review. A one-occurrence unresolved family says Standalone claim occurrence · grouping unresolved. Missing/inconsistent membership says Ungrouped claim occurrence. No family ID becomes a label.
- **Selected/focused behavior:** Selecting an occurrence highlights its row and every numbered relation port. Selecting a ledger relation highlights both endpoint cards, even across rows. Axis selection preserves row ordinal, focus, and vertical position.
- **Coverage lens behavior:** Coverage strip and non-destructive highlight. The provenance ledger also highlights matching occurrence attachments and non-claim source records.
- **Relation ledger role:** Primary for cross-row relations and complete for all candidate relations. Each `relation_id` has one authoritative semantic entry publicly presented in the **Complete relation review ledger**; entries are numbered, short at scan level, and open the full relation inspector.
- **Desktop composition:** Fixed-ordinal typed small multiples occupy the main column; a 300–360px sticky relation/Unresolved review region occupies the right column; the non-claim Dated/Unplaced section and occurrence Unplaced band sit below the dated rows.
- **Tablet composition:** Full-width fixed-ordinal small multiples followed by separately named occurrence Unplaced, non-claim Dated/Unplaced, Complete relation review ledger, and Unresolved regions. No cross-row SVG is lost because it never existed.
- **Mobile composition:** Each row becomes a chapter named Candidate thread, Standalone claim occurrence, or Ungrouped claim occurrence in the same packet-local ordinal. Relation port buttons open or jump to the matching relation-review entry. The Complete relation review ledger is expanded by default.
- **Screen-reader/keyboard representation:** Particularly strong: stable-ordinal typed row sections, occurrence buttons, and one ordered Complete relation review ledger require no spatial-edge interpretation. Display-local row numbering is not exposed as stable identity. Any port accessible name includes the relation number, relation type, other endpoint, review state, and review target.
- **Strengths:** Almost eliminates crossing/label collisions; scales better to 18+ relations; naturally represents same-source occurrences; robust on mobile; keeps the complete relation set inspectable.
- **Weaknesses:** The user cannot see the whole interaction network at a glance. Cross-row challenge/response requires matching a port to a ledger entry. The Map risks feeling like several mini Timelines unless relation ports and typed-row framing are strong.
- **Failure modes:** Calling a candidate relation review ledger accepted or authoritative in public copy; letting it become a second Sources view; hiding cross-row relations behind unexplained numbers; presenting visual ports as separate records; implying each family is authoritative; calling one occurrence a thread; reordering rows on axis changes; presenting per-row time scales that are not actually shared.
- **Expected complexity with the current code/data:** Medium. It needs occurrence/family derivation and new rendering, but less geometry than Alternative 1. No public packet change is required.

#### Prepared cooling-center case in small multiples

```text
THREAD SMALL MULTIPLES · EVENT TIME (one shared scale)
CANDIDATE RELATIONS · types requiring review, not accepted facts
              Jun 10                     Jun 12                     Jun 14       Unresolved endpoint well

T01 Candidate thread · 2 occurrences · needs review
     [City: safe spaces across city]
       Official notice · Jun 10
       ports: R2
             └────────── R1 Replaces ──────────────────────────────▶  (arrow only if composite rule passes)
                                                                  [City: corrected errors / access]
                                                                    Official update · Jun 14
                                                                    ports: R3
                                                                                Q2 Via action record chip
                                                                                Q3 Via action record chip

Standalone claim occurrence · grouping unresolved
                                         [Community: not practically accessible]
                                           Community report · Jun 12
                                           ports: R2, R3
                                                                                Q1 via actor claim → this occurrence

COMPLETE RELATION REVIEW LEDGER · all 3 candidate relations
R1  Jun 10 City occurrence — Replaces → Jun 14 City occurrence [arrow only if composite rule passes]
R2  Jun 10 City occurrence — Challenges — Jun 12 Community occurrence [Needs review · no direction]
R3  Jun 12 Community occurrence — Responds → Jun 14 City occurrence [arrow only if composite rule passes]

NON-CLAIM SOURCE RECORDS
DATED ON EVENT TIME: (none)
UNPLACED ON EVENT TIME
[Context / interpretation · Editorial source · Event time absent; Publication/Retrieval remain inspectable]

UNRESOLVED ACTION ORIGINS
Q2 Via action record · “Added free shuttle support” · Source: Official update
Q3 Via action record · “Published updated list and clarified opening hours” · Source: Official update

COVERAGE  Official 1 | Original 0 missing | Local/firsthand 1 | Specialist 1 | Challenge/correction 1
```

This alternative is not the default whole-Map grammar, but its strongest mechanism is adopted into v1 as **Relation-summary mode**. The adaptive mode preserves typed claim-row identity and the complete relation set while giving up some of Matrix mode’s at-a-glance interaction shape when presentation density makes that shape unreadable.

### Alternative 3 — Git-like claim history

This alternative treats each internally consistent multi-occurrence candidate family as a provisional branch and occurrences as commits. Standalone and ungrouped occurrences remain isolated points. It is included because it is a genuinely different lineage grammar and reveals useful tradeoffs; it is not recommended.

- **Primary user question:** Along which provisional claim branches did public statements appear, diverge, and later reconnect?
- **X axis:** Candidate claim-family branches only for internally consistent multi-occurrence families; standalone and ungrouped occurrences occupy isolated history columns. Branch/column ordinal is packet-local and fixed from the initial axis.
- **Y organization:** Selected time runs top to bottom. Same-date peer bands span branches. Initial selection uses the occurrence-primary Event → Publication → Actor assertion → Retrieval chain, or the zero-occurrence Publication → Retrieval source-record fallback. Axis changes move points along Y but do not reorder branch/column identity.
- **Primary node type:** Claim occurrence (“history point”), not source.
- **Source provenance:** A compact tag adjacent to each history point; full source record stays in inspector/Sources.
- **Relation representation:** Same-family transformative relations follow the branch rail. Cross-row challenge/follow-up relations use bridge lines. Labels remain candidate and review-only. Arrowheads obey the same composite selected-axis rule; Challenges remains non-directional.
- **Open-question representation:** An Unresolved issues rail outside chronological history. Occurrence/claim origins may back-reference history points; action, source, and topic/unknown origins use typed chips rather than borrowed claim anchors.
- **Non-claim source-record representation:** Side annotations grouped by the five derived subtypes and subdivided into **Dated on [selected axis]** and **Unplaced on [selected axis]**. Dated annotations use deterministic temporal grouping/order, never commits/history points, and never claim-relation endpoints without an occurrence. Axis switches preserve subtype/identity.
- **Time-unavailable behavior:** A separate **Unplaced on [selected axis]** bottom band after a visible axis break; other timestamps remain inspectable and the band is not later than dated records.
- **Mixed/day precision behavior:** Same-date day-level records share a horizontal peer band. Exact instants may be vertically ordered within the date; day-level records cannot be placed above/below exact instants as chronology.
- **Claim-family uncertainty:** Only a multi-occurrence consistent family receives a dashed Candidate thread branch. A one-occurrence unresolved family is an isolated Standalone claim occurrence; missing/inconsistent membership is an isolated Ungrouped claim occurrence. No visual merge implies acceptance.
- **Selected/focused behavior:** Selecting a point highlights its branch, direct bridges, and unresolved endpoints. Axis changes preserve the fixed branch/column ordinal, focus, and selected identity. Inspector behavior is otherwise the same.
- **Coverage lens behavior:** Compact source-role strip plus provenance-tag and non-claim-record highlights; branches and isolated points never disappear.
- **Relation ledger role:** Exactly one authoritative semantic entry per `relation_id`, publicly presented in the Complete relation review ledger; the ledger is the only representation for unrelated, dense parallel, or ambiguous-direction candidates, and any bridge control is a synchronized shortcut.
- **Desktop composition:** Vertical time rail with horizontally arranged provisional branch/isolated columns, a below-history Unplaced band and Non-claim section, and a right Unresolved column.
- **Tablet composition:** Horizontally scrollable history area with sticky time labels; Unplaced, Non-claim, and Unresolved sections move below as separately named regions.
- **Mobile composition:** Branches collapse into typed chapters with time top to bottom and the same packet-local fixed ordinal. Standalone and ungrouped occurrences retain their distinct names. Non-claim Dated/Unplaced subgroups follow. This is comprehensible, but the visual branch metaphor largely disappears.
- **Screen-reader/keyboard representation:** A stable-ordinal list grouped by row type and dated placement, followed by the Complete relation review ledger and unresolved questions. Display-local numbering is not stable identity. SVG rails are decorative; any bridge control is a synchronized shortcut.
- **Strengths:** Strong sense of version/change; same-family supersession is easy to see; vertical time is familiar on mobile.
- **Weaknesses:** “Commit,” “branch,” and “merge” imply authoritative version control and accepted state. Cross-family contradictions do not behave like merges. The public audience may read vertical order as causal or read a branch join as adjudication. Source/provenance coverage becomes less prominent.
- **Failure modes:** Treating candidate groupings as official branches or the relation review ledger as accepted truth; turning a standalone occurrence into a branch; treating relation joins as accepted merges; implying later means truer; reordering branch identity on axis changes; inventing direction from branch geometry or within-day position; forcing every non-claim source into Context or history geometry; using the source-control metaphor in public copy.
- **Expected complexity with the current code/data:** High. It needs branch routing, semantic guardrails, date-band layout, a separate accessible structure, and substantial responsive transformation. No packet change is strictly required, but the metaphor would benefit from reviewed family names and explicit relation directionality that the packet does not currently provide.

#### Prepared cooling-center case in Git-like history

```text
EVENT TIME ↓        T01 Candidate thread branch        Standalone occurrence           NON-CLAIM RECORDS

Jun 10 09:00        ● City: safe spaces across city
                    │ Official notice
                    │\
                    │ \ R2 Challenges — NO ARROW ───────────┐
                    │                                         │
Jun 12 12:00        │                                         ● Community: not practically accessible
                    │                                         │ Community report
                    │                R3 Responds (conditional arrow) /
                    │                                           /
Jun 14 14:15        ● City: corrected errors / access ◀────────┘  (only if composite rule passes)
                    ▲ Official update
                    └ R1 Replaces earlier guidance (only if composite rule passes)

AXIS BREAK ───────────────────────────────────────────────────────────────────────────────
NON-CLAIM SOURCE RECORDS
DATED ON EVENT TIME                                                             (none)
UNPLACED ON EVENT TIME                                                          ◇ Context / interpretation
non-chronological subgroup                                                       Opinion note · no Event time

UNRESOLVED ISSUES RAIL
Q1 representative access gaps  ← actor claim → matching Community occurrence
Q2 remediation reached residents  [Via action record · shuttle support · Official update]
Q3 durable update process         [Via action record · list/hours update · Official update]
```

The metaphor is visually efficient for R1 but less honest for R2/R3 and for candidate family uncertainty. That makes it inferior to the matrix for Sisyphus Watch.

### Alternative comparison

| Criterion | Temporal matrix | Small multiples + ledger | Git-like history |
| --- | --- | --- | --- |
| Claim change at a glance | Strong | Strong within a thread; weaker across threads | Strong for same-family sequence |
| Cross-row interaction | Visible directly | Ledger-mediated | Visible but metaphorically ambiguous |
| Dense relations | Medium; needs density policy | Strong | Weak-medium |
| Provenance without domination | Strong | Strong | Medium |
| Unresolved-question separation | Strong | Strong | Strong |
| Mobile continuity | Strong with typed claim chapters | Strongest | Medium |
| Risk of epistemic overclaim | Low if rows remain candidate | Low | High |
| Current-packet fit | Strong | Strong | Medium |
| Expected implementation complexity | Medium-high | Medium | High |

## C. Prepared-case placement summary

Every serious alternative above places the same packet material without inventing records:

| Existing material | Matrix | Small multiples | Git-like history |
| --- | --- | --- | --- |
| Initial city availability claim | Jun 10 occurrence in T01 | Jun 10 occurrence in T01 | Jun 10 history point on T01 branch |
| Community practical-access claim | Jun 12 Standalone claim occurrence · grouping unresolved | Jun 12 standalone small multiple | Jun 12 isolated standalone history point |
| Later city corrected/update claim | Jun 14 occurrence in T01 | Jun 14 occurrence in T01 | Jun 14 history point on T01 branch |
| Specialist/editorial source | Non-claim source record · Context / interpretation · Unplaced on Event time; Dated on Publication time at Jun 15 08:00 | Non-claim Dated/Unplaced section | Context / interpretation Dated/Unplaced side annotation |
| Supersedes relation | R1 solid Replaces; arrow only if composite rule passes | Intra-thread R1; conditional arrow | Same-branch R1; conditional arrow |
| Contradicts relation | Cross-row non-directional challenge R2 | Cross-row ledger R2 | Cross-branch bridge R2 |
| Follow-up relation | R3 Responds; arrow only if composite rule passes | Cross-row ledger R3; conditional arrow | Cross-row bridge R3; conditional arrow |
| Representativeness question | One Unresolved card; actor-claim origin resolves to community occurrence tether | Standalone endpoint well | Unresolved rail with occurrence back-reference |
| Remediation reach question | One Unresolved card; `Via action record` chip with shuttle action + Official update | Global unresolved panel; typed action chip | Unresolved rail; typed action chip |
| Durable update process question | One Unresolved card; `Via action record` chip with list/hours action + Official update | Global unresolved panel; typed action chip | Unresolved rail; typed action chip |
| Current source roles | Provenance badges + coverage strip | Provenance badges + coverage strip | Provenance tags + coverage strip |
| Selected time semantics | Event time because primary occurrences have explicit Event values; occurrence-primary fallback chain; no substitutions | Same | Same |

Changing the selector to Publication time would move the community occurrence from Jun 12 12:00 to Jun 12 18:30 and place the editorial Context / interpretation record at Jun 15 08:00. Changing to Actor assertion time would move the community occurrence to Jun 12 18:30 while placing the editorial record in **Unplaced on Actor assertion time** because the site-ready source summary has no eligible actor-assertion field or claim occurrence for it. Retrieval time would place the three occurrences and editorial record at the explicit Jun 15 retrieval instant; equal times must not be turned into an invented order.

Those axis changes do not reorder the T01 Candidate thread and Standalone community row vertically. Their packet-local ordinals were derived once from the initial Event axis. The occurrence cards move horizontally or into/out of the occurrence Unplaced band; the editorial record moves between the Dated and Unplaced subgroups of Non-claim source records.

Initial-axis behavior is packet-content-driven and mode-independent:

- The prepared cooling-center packet starts on Event time because primary occurrences have explicit Event values.
- An occurrence-bearing prepared/live/fallback packet with no occurrence Event values tries occurrence Publication, then occurrence Actor assertion, then occurrence Retrieval.
- A prepared/live/fallback packet with zero primary occurrences starts on Publication when any source/non-claim record has explicit Publication; otherwise it starts on Retrieval.
- The chosen initial axis never fills a missing field with a different timestamp type.

## D. Record-type mapping for the recommended design

| Record type | Map treatment | Detail destination and boundary |
| --- | --- | --- |
| Source snapshot | **Secondary inline provenance attachment** on each linked occurrence. With no occurrence, it becomes the anchor for one derived **Non-claim source record** annotation. Never the ordinary primary node. | Source inspector and Sources carry full snapshot, content boundary, URL, hashes, retrieval, classification, inclusion reason, and limitations. |
| Actor claim | **Secondary inline identity**, not a separate ordinary map node. It supplies actor/claim identity and typed question origins. A question targets every matching source-local occurrence; if none exists, one typed actor-claim origin chip is shown. | Claim/occurrence inspector. Actor claim and occurrence remain distinct records. |
| Claim occurrence | **Primary map node.** One node per source-local occurrence. | Occurrence inspector shows all four time fields, uncertainty, status, support, family, and source. |
| Candidate claim family | **Derived row organization**, not a node. A consistent multi-occurrence family becomes a Candidate thread; a one-occurrence unresolved family supplies grouping metadata to a Standalone claim occurrence; inconsistent membership is not rendered as a family row. A packet-local row ordinal is assigned once and is stable across axis changes. | Family inspector shows occurrence membership, reason, signals, unresolved flag, origin, review status, and display-local ordinal boundary. |
| Source-bound finding | **Inspector-only record detail.** On a source with no occurrence, its presence may determine the **Finding-bearing evidence source** or **Mixed non-claim source** presentation subtype, but the finding does not become a node or edge. | Source inspector; Method explains findings ≠ claims. |
| Action | **Inspector-only record detail** and, when referenced by a question, a typed **Via action record** origin chip containing concise action identity and source identity. On a source with no occurrence, actions may determine an Action-bearing or Mixed non-claim subtype. It never becomes a claim node or relation endpoint. | Source/record inspector; Method explains actions ≠ claims. |
| Candidate relation | **Occurrence-to-occurrence edge or synchronized numbered port** plus exactly one authoritative semantic ledger entry for the same `relation_id`, publicly presented in the Complete relation review ledger. | Relation inspector contains long reason, support excerpts/references, confidence, generation basis, insufficiency, exact IDs, and selected-axis direction assertion status. |
| Unresolved question | **Endpoint card in the Unresolved rail.** It has no chronological coordinate and is not a conclusion. | Question inspector shows conservative origin resolution and exact related IDs. |
| Non-claim source record | **Annotation/anchor outside claim rows.** It is a derived presentation category for a source snapshot with no claim occurrence. Its subtype is Context / interpretation, Action-bearing source, Finding-bearing evidence source, Source-only record, or Mixed non-claim source. It appears under Dated on [selected axis] when explicit or Unplaced on [selected axis] when missing; an axis switch may move it without changing identity/subtype. It can anchor a source-origin question, but cannot be a claim-relation endpoint. | Source inspector and Sources retain the source, all linked records, and other timestamps; Method explains subtype derivation and limitations. |
| Context / interpretation source | **Subtype annotation**, not the generic no-occurrence category. The prepared editorial record uses this subtype and appears in Unplaced on Event time. | Source inspector and Sources; interpretation remains distinct from findings and claims. |

No presentation rule may promote a finding to a claim, an action to a claim, a source to an occurrence, a family to accepted taxonomy, or a candidate relation to a truth judgment.

## E. Normative Map Grammar v1

The following rules define the recommended design.

### 1. Time axis

- The Map **MUST** name the selected axis in visible text.
- Claim occurrences **MUST** use the matching occurrence field: `event_time_candidate`, `assertion_time_candidate`, `source_publication_time`, or `source_retrieval_time`.
- Non-claim source records **MUST** use only an explicitly eligible source-level value for the selected axis. They **MUST NOT** borrow another axis.
- When at least one primary claim occurrence exists, first display **MUST** select the first axis with any explicit occurrence value in this order: **Event time → Publication time → Actor assertion time → Sisyphus retrieval time**.
- When zero primary claim occurrences exist, first display **MUST** select Publication time when at least one source/non-claim record has an explicit Publication value; otherwise it **MUST** select Sisyphus retrieval time.
- Action times, source-only Event values, and standalone packet time-candidate records **MUST NOT** force initial Event time when primary claim occurrences exist but have no Event value.
- This occurrence-primary initial-axis rule **MUST** be treated as an intentional presentation behavior change from the current source-node derivation, not as an unchanged invariant or packet mutation.
- Initial-axis choice **MUST** choose only the viewing axis. It **MUST NOT** substitute the chosen time meaning into another record’s missing selected-axis value.
- A user **MAY** still manually select any available axis; the absence of placed occurrences then remains explicit rather than triggering fallback.
- A Map axis change is a viewing operation and **MUST NOT** change the packet.

### 2. Claim-row types (thread rows only when multi-occurrence)

- A multi-occurrence family with unique, bidirectionally consistent membership **MUST** create one row labeled **Candidate thread · N occurrences · needs review**.
- A one-occurrence unresolved family **MUST** create a row labeled **Standalone claim occurrence · grouping unresolved**. It **MUST NOT** be called a thread or change sequence.
- An occurrence with missing or inconsistent family membership **MUST** create an individual row labeled **Ungrouped claim occurrence**.
- Rows **MUST NOT** be labeled by parsing `family_id`.
- When a packet is first displayed, the presentation **MUST** derive one packet-local row ordinal using the selected initial axis and stable tie-breaks: rows with an explicit initial-axis value before rows without one; earliest explicit initial-axis date/group first; then stable family ID for valid families or stable occurrence ID for Ungrouped rows.
- Same-date day-precision peers and mixed-precision peers **MUST NOT** gain chronological order from the ordinal. A stable ID tie-break **MAY** determine rendering only.
- The row ordinal **MUST** remain fixed for the lifetime of the displayed packet. Changing Event, Publication, Actor assertion, or Retrieval axes **MUST** move occurrence cards horizontally or into/out of the occurrence Unplaced band without vertically reordering rows.
- Displaying a new packet **MUST** recompute that packet’s initial axis and row ordinal.
- Without a reviewed display label, a multi-occurrence Candidate thread **MAY** use neutral presentation numbering plus a representative claim excerpt, for example “T01 · Candidate thread · 2 occurrences · needs review.” Such numbering **MUST** be display-local to the current packet and **MUST NOT** be treated as public/export/stable identity. Standalone and Ungrouped rows **MUST NOT** receive invented thread numbers.

### 3. Occurrence cards

- A claim occurrence **MUST** be the ordinary primary node.
- The card **MUST** show actor, concise original claim text, selected-axis time/precision state, occurrence record boundary, and a source provenance attachment.
- The card **MUST NOT** replace the original claim with a finding, action, or model synthesis.
- The full claim **MUST** remain in the semantic DOM. CSS **MAY** visually clamp it at scan level, and an explicit expand or inspect action **MUST** provide full visual access.
- A separate `aria-label` **SHOULD NOT** duplicate the full claim merely because CSS clamps visible text. Accessible name and visible label **MUST NOT** conflict or cause unnecessary duplicate speech.
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
- Left/right IDs and selected-axis left/right position **MUST NOT** independently assert semantic direction. The current packet has no separately reviewed semantic-direction field.
- An arrowhead **MAY** appear only when all four conditions hold: the relation type belongs to a documented directional family; both endpoint values on the currently selected axis are explicit; that axis supplies strict chronological order; and earlier-to-later order agrees with the relation record’s left/right endpoint order.
- If any condition fails, the relation line and short semantic label **MUST** remain, the arrowhead **MUST** be omitted, and the ledger/accessible text **MUST** say **Direction not asserted on the selected axis**.
- Contradiction/challenge relations **MUST** remain non-directional regardless of endpoint order.
- Same-source relations **MUST** be representable because separate occurrence nodes remove the current source-card self-loop problem.
- `unrelated` candidates **SHOULD** remain in the ledger and inspector rather than drawing a misleading connection in the matrix.
- In default **Matrix mode**, all readable intra-thread and cross-row spatial relations **MAY** be drawn.
- **Relation-summary mode** **MUST** activate when validated presentation measurements of relation count, collision, and available width make the full edge field unreadable. Useful intra-thread and selected relations **MAY** remain spatial; cross-row relations **SHOULD** use synchronized numbered ports.
- Density mode is presentation-only. It **MUST NOT** change relation status, type, membership, confidence, or packet data, and **MUST NOT** silently hide a relation.

### 6. Relation labels

- Spatial labels **MUST** be short verbs or verb phrases: Replaces, Corrects, Narrows, Responds, Challenges, Supports, Same event, or Unclear.
- A label **MUST** read as line annotation, not an independent data card.
- The Map **MUST** display a global boundary equivalent to **Candidate relation labels describe types requiring review, not accepted facts**.
- “Needs review” **MUST** be available in the accessible name and selected/inspector state; it need not be repeated as a large spatial box on every line.
- Full reason and support **MUST** stay in inspector/ledger.

### 7. Unresolved-question endpoints

- Every unresolved question **MUST** appear exactly once in a named Unresolved rail.
- The rail **MUST** sit outside the chronological plot and state “Evidence questions · not conclusions · not chronological records.”
- A question **MUST NOT** receive a date merely because a related record has one.
- One question with multiple related records **MUST** remain one card with multiple origins.
- The presentation adapter **MUST** derive each origin as exactly one of: **occurrence**, **actor claim**, **action**, **source**, or **topic / unknown**. This is derived presentation state, not a new packet fact.
- An occurrence origin **MUST** anchor to that occurrence.
- An actor-claim origin **MUST** anchor to every matching source-local occurrence. If no occurrence exists, it **MUST** use a typed actor-claim origin chip rather than an arbitrary source or topic substitution.
- An action origin **MUST** use a **Via action record** chip containing concise action identity and source identity. It **MUST NOT** anchor to an arbitrary occurrence body or occurrence provenance attachment.
- A source origin **MUST** use a source-origin chip, or one unique non-claim source-record anchor when that exact source has no occurrence.
- A topic / unknown origin **MUST** be labeled as a topic-level evidence gap and **MUST NOT** invent a record anchor.
- Only occurrence and matching actor-claim origins **SHOULD** draw occurrence tethers by default. Action/source origin chips **MUST NOT** visually imply ownership by a claim body.

### 8. Non-claim source records

- A source snapshot with no claim occurrence **MUST** be presented, when present in Map, as a **Non-claim source record** outside all claim rows. It **MUST NOT** be generically called context.
- Its derived presentation subtype **MUST** be one of: **Context / interpretation**, **Action-bearing source**, **Finding-bearing evidence source**, **Source-only record**, or **Mixed non-claim source**.
- Subtyping **SHOULD** use only existing linked actions/findings and existing source metadata. When the packet does not support a more specific subtype without textual inference, the adapter **MUST** use Source-only record. Multiple supported roles **MUST** use Mixed non-claim source.
- The Non-claim source records section **MUST** contain two named subgroups: **Dated on [selected axis]** and **Unplaced on [selected axis]**.
- A non-claim record with an explicit selected-axis value **MUST** appear in Dated on [selected axis], show that explicit value, and use the same deterministic date/precision grouping and ordering rules as the selected axis.
- A non-claim record without an explicit selected-axis value **MUST** appear in Unplaced on [selected axis]. It **MUST** retain the selected-axis-specific Unplaced label, and other timestamps **MUST** remain inspectable.
- Switching axes **MAY** move a non-claim record between Dated and Unplaced. Its subtype, source identity, record boundary, and source-role coverage identity **MUST NOT** change.
- Each annotation **SHOULD** show subtype, source role, concise title/publisher, plain-language source record boundary, and selected-axis placement state. Full actions, findings, evidence, summaries, interpretation, other timestamps, and raw status remain in inspector/Sources.
- A non-claim source record **MAY** be the unique anchor for a source-origin unresolved question. It **MUST NOT** become a claim-relation endpoint unless that source has an actual claim occurrence referenced by the relation.
- Dated non-claim records **MUST NOT** enter claim rows or occurrence relation geometry merely because they have an explicit time.
- The prepared editorial record **MUST** appear as Context / interpretation; this example **MUST NOT** set the generic category for action-bearing, finding-bearing, source-only, or mixed records.

### 9. Unplaced on the selected axis

Two placements were evaluated. A terminal broken-axis column preserves row alignment, but its position after the latest date can still read as “later” and competes with the right-side Unresolved rail. A non-chronological band below the dated matrix costs some vertical distance, but separates missing placement from both chronology and unresolved evidence status.

- v1 **MUST** use the band below the dated matrix and label it **Unplaced on Event time**, **Unplaced on Publication time**, **Unplaced on Actor assertion time**, or **Unplaced on Sisyphus retrieval time**.
- The band **MUST** state that it is non-chronological and not a later column. Other timestamps **MUST** remain inspectable.
- Claim occurrences in the band **MUST** retain their Candidate thread, Standalone, or Ungrouped row identity. The separate Non-claim source records section uses its own Dated/Unplaced subgroups under Rule 8; it **MUST NOT** place source annotations inside claim-row geometry.
- No arrow direction **MAY** be inferred into, out of, or through the Unplaced band.
- Stable DOM/order sorting inside the band **MUST** be described as record order, not time order.
- The Unplaced band and Unresolved rail **MUST** remain separately named: the former means missing placement on the selected axis; the latter means an unresolved evidence question with no chronological coordinate.

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

- Multi-occurrence family rows **MUST** remain explicitly candidate/review-only even when all occurrence records come from the deterministic fixture.
- `grouping_reason` and `grouping_signals` **SHOULD** appear only in family inspector or a compact disclosure.
- A one-occurrence unresolved family **MUST** render as **Standalone claim occurrence · grouping unresolved** and **MUST NOT** be described as a thread or demonstrated change sequence.
- No implementation **MAY** parse a family ID into a public label.

### 13. Unassigned/ungrouped claims

- The presentation adapter **MUST** cross-check family `occurrence_ids` against occurrence `candidate_claim_family_id`.
- If an occurrence has no family, references a missing family, appears in multiple families, or has inconsistent bidirectional membership, the UI **MUST NOT** auto-cluster it.
- Each such occurrence **SHOULD** receive its own “Ungrouped claim occurrence” row under an Ungrouped band.
- A presentation warning **SHOULD** be available in Method/inspector; no public packet mutation is permitted.

### 14. Selection

- Selecting an occurrence **MUST** open occurrence detail, not silently substitute source detail.
- Selecting a provenance attachment **MUST** open source detail.
- Selecting a relation **MUST** highlight both occurrence endpoints.
- Selecting a question **MUST** highlight its conservative occurrence anchors and identify action/source/topic chips without transferring highlight ownership to an arbitrary claim body.
- Changing the time axis **MUST** preserve the selected entity, the packet-local row ordinal, and the row's vertical position. Occurrence cards may move horizontally or into/out of the Unplaced band; Non-claim source records may move between their Dated and Unplaced subgroups.
- Displaying a different packet **MAY** reset selection after deriving that packet's own initial axis and row ordinal; it **MUST NOT** carry a presentation-local T-number across packets as identity.
- Selection **MUST** preserve packet state and **MUST** restore focus and scroll when the inspector closes.

### 15. Row trace

- A multi-occurrence row trace **SHOULD** be named **Candidate thread trace** and highlight all occurrences in that candidate family, intra-family relations, direct cross-row relation endpoints, and related unresolved endpoints.
- A one-occurrence row trace **MUST** be named **Standalone occurrence trace**; an inconsistent/missing-membership trace **MUST** be named **Ungrouped occurrence trace**. Neither **MAY** imply a demonstrated thread.
- Other rows **SHOULD** remain visible but dimmed.
- Every trace summary **MUST** describe a viewing operation and candidate/grouping boundary; it **MUST NOT** say a thread, grouping, or occurrence is accepted or true.

### 16. Coverage lenses

- The Map **MUST** preserve a compact count for every source role, including zero and missing target roles.
- Coverage lenses **MAY** highlight baseline/expansion or source roles.
- Lenses **MUST** apply to occurrence provenance attachments and non-claim source records as appropriate.
- Lenses **MUST NOT** remove records from the accessibility tree, change relation/family membership, combine packets, or mutate canonical state.
- Method **MUST** remain the primary place for coverage basis, missing-role interpretation, discovery counts, and nonexhaustiveness.

### 17. Inspector transition

- Desktop/tablet inspector **SHOULD** remain nonmodal; mobile inspector **MUST** be modal with focus containment.
- Occurrence detail **SHOULD** show actor, full claim, all four timestamps, uncertainty, support kind/reference, family membership, source attachment, origin, and exact boundary.
- Relation detail **MUST** show the full reason and both support references.
- Family detail **SHOULD** show membership, reason, signals, unresolved state, and review status as family-specific content rather than falling through to generic question detail.
- Question detail **MUST** show each typed origin, exact related ID, and whether it resolves to an occurrence anchor, actor-claim chip, action chip, source chip/unique non-claim anchor, or topic-level gap.
- Non-claim source detail **MUST** retain the source snapshot boundary and linked findings/actions/evidence/summary without converting those records into a claim.
- An axis transition **MUST** keep the focused entity and fixed packet-local row ordinal when that entity remains present. Opening a newly displayed packet recomputes its ordinal independently.

### 18. Relation ledger

- The public heading **MUST** be **Complete relation review ledger** or **Candidate relation ledger**. Public and accessible labels **MUST NOT** call candidate/pending-review relation records canonical.
- Every `relation_id` **MUST** have exactly one authoritative semantic ledger entry, independent of SVG geometry and density mode. This is an internal representation rule, not a claim that the candidate relation itself is canonical or accepted.
- Ledger endpoints **MUST** be occurrence descriptions: actor + concise claim + selected-axis time + source role/title.
- Same-source, parallel, ambiguous-order, unresolved, and unrelated candidates **MUST** remain present.
- Each entry **MUST** include relation type, review state, and whether direction is asserted on the selected axis under the composite arrow rule.
- A visual edge or numbered port **MAY** be an additional synchronized shortcut for the same `relation_id`; multiple affordances **MUST NOT** appear as different records or expose conflicting semantics.
- When Relation-summary mode is active, the Map **MUST** visibly announce simplification and the retained count, for example **Spatial overview simplified · all 18 candidate relations remain listed below**.
- Mode selection **MUST** use validated presentation measurements rather than an epistemic hard-coded threshold. Implementers **MUST** validate the policy against current 3-, 5-, and 8-source density fixtures.
- On `<=920px`, the ledger **SHOULD** be expanded by default because cross-row relations become port references rather than drawn curves.

### 19. Mobile transformation

- Mobile **MUST** preserve the grammar’s entities: typed claim row, occurrence, provenance attachment, candidate relation, non-claim source record, and Unresolved rail.
- It **MUST NOT** fall back to one global source-card chronology.
- A multi-occurrence family **MUST** become a Candidate thread chapter; a one-occurrence unresolved family **MUST** become a Standalone claim occurrence chapter; missing/inconsistent membership **MUST** become an Ungrouped claim occurrence chapter. Chapter order **MUST** follow the fixed packet-local row ordinal and **MUST NOT** change when the selected axis changes.
- Within each chapter, selected time **MUST** run top to bottom with the same Unplaced/day/mixed rules.
- Non-claim source records **MUST** follow in their own section with **Dated on [selected axis]** and **Unplaced on [selected axis]** subgroups. Axis changes may move records between those subgroups without changing their identity or subtype.
- Cross-row relations **MAY** transform into numbered relation shortcuts backed by the **Complete relation review ledger**. Density mode **MUST NOT** silently hide relations.

### 20. Accessibility

- The semantic DOM **MUST** contain every occurrence, typed row header, non-claim source record, and unresolved question without hidden responsive duplicates. Typed row headers/chapters **MUST** follow the fixed packet-local row ordinal on every responsive path.
- A presentation-local T-number **MAY** be spoken as a navigation aid, but the accessible name **MUST** also state the exact row type and **MUST NOT** present the number as a stable/public/export identity.
- SVG paths **MUST** be decorative and `aria-hidden`; every relation **MUST** be keyboard- and screen-reader-reachable through its one authoritative semantic entry in the **Complete relation review ledger**.
- If a visual relation edge/port shortcut is keyboard-accessible, its accessible name **MUST** identify the same candidate relation, review state, endpoints, and ledger/detail target.
- Occurrence accessible names **MUST** include the exact row type, actor, claim, selected-axis time/precision or Unplaced state, record boundary, and concise source provenance.
- Visible claim text **SHOULD** supply its own accessible text even when visually clamped; an alternate accessible label **MUST NOT** conflict with it or create unnecessary duplicate speech.
- Relation accessible names **MUST** name both occurrence endpoints, type, review state, and any non-chronological ordering condition, including **Direction not asserted on the selected axis** when applicable.
- The Map **MUST** provide skip targets for Unresolved questions and Candidate relations.
- Local horizontal scroll regions **MUST** be keyboard-focusable only when they actually overflow, must name their analytical content, and must not cause page-level horizontal overflow.
- Responsive alternatives **MUST NOT** expose duplicate accessible copies of the same Map.

## F. Relation visual language

The Map should use **short text + restrained geometry**. Color should encode general state—candidate, selected, dimmed—not semantic type. A visible legend/boundary must say that all spatial relation labels are candidate types requiring review, not accepted facts.

| Semantic family | Relation types | Line | Arrow | Short label | Color role |
| --- | --- | --- | --- | --- | --- |
| Transformative update | `supersedes`, `correction`, `narrows` | Solid | Closed arrow only when all composite-rule conditions pass | Replaces, Corrects, Narrows | Common candidate stroke; selected state changes color |
| Responsive sequence | `follow_up` | Long dash | Open arrow only when all composite-rule conditions pass | Responds | Same candidate palette |
| Tension | `contradicts` | Solid with opposing terminal ticks; no arrow | None | Challenges | Same candidate palette; not red-only |
| Reinforcement/context | `corroborates`, `same_event` | Dotted/short dash | None | Supports, Same event | Same candidate palette |
| Indeterminate | `unresolved` | Sparse dots | None | Unclear | Muted candidate palette |
| No direct connection | `unrelated` | No spatial line by default | None | No direct change | Ledger only |

Arrow style distinguishes a documented directional semantic family only after the conservative eligibility test. It does not convert packet left/right order into a reviewed semantic direction. Line style and short label carry the relation family when the arrow is absent.

For the prepared case on Event time:

- R1 uses a solid line and short **Replaces** label. Its arrowhead is eligible because `supersedes` is documented as directional, both Event values are explicit, Event time supplies strict order, and that order agrees with the relation record endpoint order.
- R2 uses a non-directional tension line with **Challenges**. It does not rely on red and does not turn contradiction into a truth verdict.
- R3 uses a long-dash line and short **Responds** label. Its open arrowhead is eligible only because `follow_up` is documented as directional and the same three selected-axis/order conditions pass.

Changing the axis can remove an arrow without changing the relation. If either endpoint is Unplaced, the values are equal, day/mixed precision prevents strict order, or selected-axis chronology conflicts with record endpoint order, the line and label remain and the ledger/accessible text says **Direction not asserted on the selected axis**. R2 never receives an arrow.

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

The top boundary is the **occurrence** boundary. The source attachment has its own boundary only when needed. In the prepared Jun 14 example, the public labels are **Needs review** for the claim occurrence and **Prepared source record** for the source snapshot; the design must not collapse those two facts. Raw status may remain available in technical detail, but it is not the primary public wording.

The full claim remains semantic DOM text even when CSS shows a short visual clamp. An explicit Expand claim or Inspect occurrence control provides full visual access; the card should not repeat the same claim in a separate `aria-label` solely to compensate for clamping.

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

For a non-claim source record, the scan-level attachment becomes a standalone annotation with subtype, role, concise source identity, record boundary, and selected-axis placement state. Linked action/finding text and the full source evidence/summary remain in inspector/Sources; the annotation does not impersonate an occurrence.

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

1. **Occurrence** → the exact occurrence anchor.
2. **Actor claim** → every matching source-local occurrence. If no occurrence exists, a typed actor-claim origin chip names the actor and concise claim; the UI does not borrow a source anchor.
3. **Action** → a **Via action record** chip containing concise action identity and source identity. It has no default occurrence tether and never attaches to an arbitrary claim body or provenance attachment.
4. **Source** → a source-origin chip, or one unique non-claim source-record anchor when that exact source has no occurrence. A source with claim occurrences still does not make one arbitrary occurrence the question origin.
5. **Topic / unknown** → a topic-level evidence gap with no invented record edge.

A multi-origin question remains one card and receives multiple typed origins. Occurrence and matching actor-claim origins may receive thin dashed tethers on wide desktop; other origin types remain chips by default. Tethers use no arrowhead and the label **Evidence gap**, clearly distinct from candidate claim relations. The rail position is an endpoint convention, not a claim that the question occurs after the latest date.

In the prepared case, Q1 resolves its actor claim to the community occurrence and may use one occurrence tether. Q2 shows `Via action record · Added free shuttle support for vulnerable residents · Source: Official update`. Q3 shows `Via action record · Published an updated list and clarified opening hours · Source: Official update`. Neither action chip tethers to the Jun 14 claim body.

## I. Coverage role after removing source lanes

Source-role information moves to four coordinated places:

1. **Compact Map coverage strip:** every role and count, including zeros; missing target roles visibly marked.
2. **Occurrence provenance badge/non-claim source annotation:** the role of the supporting source at the point of use.
3. **Coverage lenses:** non-destructive highlights for baseline/expansion and role-oriented review.
4. **Method and Sources:** complete coverage basis, discovery/pass metrics, missing-role explanation, why included, source context, and limitations.

The prepared strip should read approximately:

```text
Coverage · prepared fixture
Official & established 1 | Original records 0 — missing | Local & firsthand 1
Specialist context 1 | Challenges & corrections 1
```

On live packets, the strip may additionally show Standard or Coverage expansion as the basis, but must not claim exhaustive coverage. Selecting a role dims nonmatching occurrences and non-claim source records; it does not remove them or change candidate relations. The strip counts source roles regardless of whether a source has a claim occurrence, so moving no-occurrence sources out of claim rows does not erase diversity or gaps.

## J. Responsive transformation

Desktop and mobile use the same entities and boundaries. Only geometry changes.

### `>1200px` — full matrix

- Three aligned regions: `220px` sticky typed row headers; flexible dated matrix; `280–320px` Unresolved rail.
- The prepared case should fit without horizontal scrolling at common wide widths. Dense/many-date packets may scroll **inside the time matrix only**.
- Date headers and row headers remain sticky within their local scroll axes. Headers say Candidate thread, Standalone claim occurrence, or Ungrouped claim occurrence as derived. Their packet-local ordinal is fixed from the initial axis; changing axes never reorders rows vertically.
- The prepared case uses low-density Matrix mode and draws all three relations. R2 has no arrow; R1/R3 arrows appear only after the composite rule passes. Long reasons stay out of the canvas.
- If adaptive Relation-summary mode activates, a visible retained-count announcement precedes the matrix; useful intra-thread/selected edges remain, cross-row ports replace unreadable curves, and every relation remains in the **Complete relation review ledger**.
- The **Unplaced on [selected axis]** band spans below the dated rows and retains row identity. It is visibly non-chronological rather than a terminal time column.
- Non-claim source records form a typed section below the claim material with **Dated on [selected axis]** and **Unplaced on [selected axis]** subgroups. The prepared editorial record is Context / interpretation: it sits in Unplaced on Event time and Dated on Publication time at Jun 15, 2026, 08:00. Neither placement enters claim-row or relation geometry.
- Occurrence/claim question tethers may cross to the side rail. Action/source origins render as typed chips inside the question card and do not attach to claim bodies.
- The focused inspector remains a nonmodal side panel. Selection scrolls the occurrence into view before opening, but the panel must not reset the matrix’s horizontal position.

### `921–1199px` — compact matrix with analytical scroll

- The matrix remains a matrix; it does not become a global source list.
- Typed row headers narrow to approximately `168–184px` and remain sticky in the same fixed packet-local order across axis changes.
- The time plane uses contained horizontal scrolling with a visible, conditional hint and Left/Right/Home/End keyboard support only when measured overflow exists.
- The Unresolved rail moves below the matrix as a full-width bordered section with a two-column card grid when space permits. Origin tethers become labeled origin chips because the rail is no longer aligned beside the rows.
- The non-chronological occurrence Unplaced band and typed Non-claim source records section stay between the matrix and Unresolved section. The source section retains its Dated/Unplaced subgroups; distinct headings prevent any of them from being read as an evidence question.
- Relation lines remain visible inside the matrix in Matrix mode. If Relation-summary mode activates, cross-row relations use numbered shortcuts and the ledger, with the retained relation count announced.
- Inspector remains nonmodal, fixed or docked, with selection/scroll restoration.

### `<=920px` — typed claim chapters

- The spatial matrix transforms into one section per typed row, not one global time-ordered list of source cards.
- Multi-occurrence consistent families become **Candidate thread · N occurrences · needs review** chapters. One-occurrence unresolved families become **Standalone claim occurrence · grouping unresolved** chapters. Missing/inconsistent membership becomes **Ungrouped claim occurrence** chapters. Chapter order follows the fixed packet-local ordinal; changing axes moves occurrences within chapters or into/out of Unplaced without reordering chapters.
- Selected time runs top to bottom inside each chapter. Day/mixed rules remain explicit; records without the selected value appear in a named Unplaced subsection, not at the chronological end without a break.
- Intra-thread relations may render between occurrence cards. Cross-row relations become numbered shortcuts on endpoints and complete entries in the **Complete relation review ledger**; the view is effectively Relation-summary mode and announces that spatial relations are simplified.
- Typed Non-claim source records follow all claim chapters in a distinct section with **Dated on [selected axis]** and **Unplaced on [selected axis]** subgroups. Switching axes may move a record between subgroups, but its subtype and source identity remain unchanged.
- The Unresolved rail follows Non-claim source records as a distinct terminal section and retains the same heading and one-card-per-question rule. Every origin becomes a typed chip; action/source chips never borrow an occurrence.
- The relation ledger follows or precedes Unresolved through a visible jump link; it is expanded by default.

### Mobile around `390px`

- One content column, no page-level horizontal scroll.
- Occurrence card order: boundary + actor; full/expandable claim; selected-axis time; provenance attachment.
- Chapter accessible/visible names preserve Candidate thread, Standalone claim occurrence, or Ungrouped claim occurrence; no sticky shorthand may erase that distinction.
- Chapter order stays fixed for the displayed packet across axis changes. Any T-number is explicitly a presentation-local navigation label, not a stable/public/export identity.
- Relation shortcuts are full-width or wrap safely and name relation type, review state, the other occurrence by actor + short claim, and the ledger target—never only an ID.
- Coverage starts as `4 sources · 4 of 5 target roles represented`; an accessible disclosure reveals every role/count and the missing Original records role.
- Source provenance remains role + concise title/publisher on-card; full source mechanics remain one explicit inspector action away.
- Q1 shows an actor-claim-to-occurrence origin chip. Q2/Q3 show stacked **Via action record** chips with action and Official update source identity.
- The occurrence Unplaced section says **Unplaced on Event time** in the prepared case and states that Publication/Retrieval remain inspectable. The separate Non-claim source section shows both Dated and Unplaced subgroup headings even when one is empty.
- The inspector uses the existing modal model, focus containment, Escape close, and focus/scroll restoration.

### Narrow mobile around `360px`

- Actor, state, and source-role badges stack rather than squeeze.
- Controls become full-width with at least `44px` targets.
- Source title and publisher wrap to two compact lines; no domain/ID is shown on the card face.
- Coverage remains a disclosure rather than a horizontally scrolling chip strip.
- Question origin chips stack beneath the question text.
- Non-claim source subtype, source identity, and Dated/Unplaced state stack as separate lines; an action-bearing or finding-bearing record is never shortened to Context.
- The spatial-simplification announcement and **Complete relation review ledger** jump remain visible before any numbered ports.
- The modal inspector uses a small viewport inset and internal scrolling; the underlying page remains fixed.

### Horizontal scrolling policy

Horizontal scrolling is an analytical tool only at matrix widths above 920px. It belongs to the dated time plane, must have a conditional visible/accessible hint, and must preserve sticky typed-row identity and the fixed packet-local ordinal. The Unplaced band and Unresolved rail do not extend the chronological scroll range. Below 920px, typed chapters remove the need for horizontal analysis. At no width may the page itself overflow horizontally.

## K. Implementation impact without implementation

### `InvestigationMapView`

Likely presentation changes:

- Replace source-lane/source-card rendering with typed claim rows and occurrence cards.
- Add compact coverage strip, derived Non-claim source records, a below-matrix Unplaced band, and Unresolved rail.
- Change selection targets so the occurrence body opens `claim_occurrence`; provenance opens `source`; row header may open `claim_family`.
- Keep SVG paths decorative and make any visual relation control a synchronized shortcut to the authoritative semantic entry in the **Complete relation review ledger**/detail target.
- Render a visible candidate-relation boundary and a retained-count announcement whenever Relation-summary mode simplifies the spatial field.
- Render typed question-origin chips so action/source origins do not borrow occurrence anchors.
- Preserve conditional local scroll, focus restoration, coverage highlighting, and responsive inspector semantics.
- Replace the current `<=920px` source chronology with Candidate thread, Standalone claim occurrence, and Ungrouped claim occurrence chapters.
- Preserve one packet-local row ordinal across every axis selection and responsive transformation; recompute it only when a different packet is displayed.
- Render Non-claim source records in explicit Dated/Unplaced subgroups without admitting them to claim-row or occurrence-relation geometry.

### `investigation-map` derivation

A new internal derived-view model would likely need:

- `InvestigationClaimRow`, a discriminated union of `candidate_thread`, `standalone_occurrence`, and `ungrouped_occurrence`, with a packet-local `rowOrdinal` derived once from the initial axis;
- `InvestigationOccurrenceNode` with selected-axis value/precision/region;
- `InvestigationSourceAttachment`;
- `InvestigationNonClaimSourceRecord` with the five presentation subtypes, a `dated | unplaced` selected-axis placement region, and selected time-group metadata when dated;
- occurrence-to-occurrence relation endpoints;
- `InvestigationUnresolvedEndpoint` with `occurrence | actor_claim | action | source | topic_unknown` presentation origins and explicit anchor/chip behavior;
- family-membership diagnostics and ungrouped rows;
- composite arrow eligibility derived from selected-axis endpoint values plus packet endpoint order;
- `matrix | relation_summary` presentation mode, retained relation count, collision/width measurements, and routing metadata that never change the packet.

The derivation should use occurrence time fields directly. For a packet with primary claim occurrences, initial-axis selection must choose the first axis with any explicit occurrence value in this order: **Event → Publication → Actor assertion → Sisyphus retrieval**. For a packet with zero primary claim occurrences, it must choose Publication when any source/Non-claim source record has an explicit Publication value; otherwise Retrieval. This intentionally differs from the current source-node helper, which can acquire Event values from occurrences, actions, and time candidates. It selects only the initial viewing axis and never substitutes one time meaning for a missing value.

After selecting the initial axis, the adapter should derive one stable packet-local `rowOrdinal` using Rule 2's explicit/missing, date/precision, and stable-ID tie-breaks. Axis-selection state must reuse that ordinal rather than re-sort rows; only displaying a different packet recomputes it. Presentation-local T01/T02 labels may be generated from the ordinal, but must never be persisted, exported, or treated as family identity.

The adapter should derive each Non-claim source record's selected-axis `dated | unplaced` subgroup independently. Axis changes may move that record between subgroups while retaining its exact source identity, subtype, and coverage role. The adapter should keep source, actor-claim, action, and finding indexes for provenance, non-claim subtyping, and typed question origins. Coverage and row-trace functions can remain pure derived viewing operations.

### Contracts

**No public packet/schema/API change is required to implement v1.** The existing packet provides occurrence text/actor/time/status/source/support/family, candidate family membership/reason/signals, candidate relation endpoints/type/reason/support, source snapshots/roles/coverage, actions/findings, and unresolved related IDs.

The current `candidate_claim_families` are sufficient for **candidate row membership**, but insufficient for reliable public thread identity:

- there is no human-readable family label;
- every family remains `pending_review` and candidate;
- one-occurrence families may be explicitly unresolved;
- the interface does not carry a reviewed row order;
- the schema records both family `occurrence_ids` and occurrence `candidate_claim_family_id`, but the visible contract validation does not establish a presentation guarantee of unique, bidirectionally consistent membership.

Therefore v1 must use neutral presentation numbering only for multi-occurrence Candidate threads, show candidate uncertainty, render the one-occurrence prepared family as a Standalone claim occurrence, and fail closed to one Ungrouped claim occurrence row per inconsistent occurrence. The numbering is derived from the fixed displayed-packet ordinal and is neither stable across packets nor a public/export identity. It must not infer a label from normalized text or stable IDs.

The five non-claim presentation subtypes, their Dated/Unplaced placement state, the fixed packet-local row ordinal, and the five question-origin types are internal derived-view discriminators. They do not require or justify a packet/schema/API change. If existing linked records and source metadata cannot support a subtype, the presentation fails closed to Source-only record; if a related question ID cannot resolve, it becomes topic / unknown.

### CSS/layout

- Introduce a sticky-row-header + time-plane grid.
- Use date-group columns rather than one column per source.
- Add a non-chronological **Unplaced on [selected axis]** band below the dated grid and a separately named right/stacked Unresolved rail.
- Add a typed Non-claim source records section outside claim rows.
- Within that source section, render deterministic **Dated on [selected axis]** and **Unplaced on [selected axis]** subgroups; neither participates in occurrence edge routing.
- Keep row-grid placement bound to the stored packet-local ordinal so time-axis transitions cannot cause vertical reflow between rows.
- Route occurrence-level edges in per-row channels; reserve cross-row channels outside card bodies.
- Define Matrix and Relation-summary modes. Switch only when validated relation-count, collision, and available-width measurements make the full edge field unreadable; retain useful selected/intra-thread edges and use numbered cross-row ports while every relation stays in the **Complete relation review ledger**.
- Preserve reduced-motion behavior and measured-overflow focusability.

The document intentionally does not hard-code a relation-count threshold. The implementation policy must be validated against the existing 3-, 5-, and 8-source density fixtures. It is presentation logic only, never epistemic logic.

### Inspector

- Expand occurrence detail to include all four timestamps, family membership, uncertainty, support, source attachment, and record boundaries.
- Add a family-specific detail body.
- Change relation endpoint summaries from source titles to occurrence actor/claim/source summaries.
- Show typed question-origin details, including action/source identity, without navigating through an arbitrary occurrence.
- Preserve source/action/finding separation and the model-summary-versus-captured-text boundary.
- Preserve desktop nonmodal/mobile modal behavior and exact focus restoration.
- Preserve the focused entity and fixed row ordinal on time-axis transitions; public boundary copy uses Prepared case record, Prepared source record, and Needs review, with raw status confined to technical detail when necessary.

### Relation ledger

- Keep all current relation IDs/support/detail behavior.
- Label the public surface **Complete relation review ledger** or **Candidate relation ledger**; do not label candidate/pending-review records canonical.
- Render occurrence endpoints and selected-axis order basis.
- Produce exactly one authoritative semantic entry per `relation_id`; visual edges/ports reference that entry rather than creating additional semantic records. This architectural authority does not change the candidate/review-only status of the relation.
- State **Direction not asserted on the selected axis** whenever the composite arrow rule fails.
- Include same-source relations spatially where possible and always in the ledger.
- Include `unrelated` in the ledger even when omitted from spatial geometry.
- Make synchronized numbered-port identity available for tablet/mobile/Relation-summary mode and announce the retained total whenever geometry is simplified.

### Mobile path

- Replace `map.sources.map(...)` global order with typed chapters built from occurrence nodes in the fixed packet-local row ordinal.
- Keep all Non-claim source records outside those chapters, preserve their five subtypes, and render their Dated/Unplaced subgroup placement.
- Convert cross-row relations to synchronized endpoint ports + the one authoritative semantic entry in the **Complete relation review ledger**.
- Preserve the non-chronological Unplaced subsection inside/after the relevant chapter and keep it distinct from Unresolved.
- Keep Unresolved as a final rail, not ordinary cards mixed into a thread chronology.

### Tests

Tests should prove:

1. Pure deterministic derivation and no packet mutation.
2. Every occurrence is rendered exactly once as Candidate thread membership, Standalone claim occurrence, or individual Ungrouped claim occurrence.
3. Multi-occurrence consistent, one-occurrence unresolved, and missing/inconsistent memberships receive the exact distinct row labels; no family ID is parsed into a label.
4. Inconsistent/missing/duplicate family membership fails closed without auto-clustering.
5. Row trace and mobile chapter accessible names preserve the same three row types.
6. Relation endpoints remain exact occurrence IDs; no source projection occurs.
7. Same-source and parallel relations remain represented.
8. Each selected axis uses only its matching occurrence/source value. Initial axis selection proves the full occurrence-bearing chain—Event, then Publication, then Actor assertion, then Retrieval—and the zero-occurrence chain—source/Non-claim Publication when present, otherwise Retrieval. No fallback substitutes one time meaning into another field.
9. One packet-local row ordinal is derived from the selected initial axis and stable tie-breaks, remains identical across every manual axis change and responsive layout, and is recomputed for a newly displayed packet. T01/T02 numbering is presentation-local, absent from public/export identity, and same-day peer placement remains non-chronological.
10. Missing, day, and mixed precision never gain artificial order. Occurrence Unplaced records use the selected-axis-specific below-matrix band and never act as a later column.
11. The composite arrow rule is tested condition by condition, including conflicting record order; Challenges never has an arrow.
12. All five Non-claim source record subtypes remain outside claim rows and never become claim-relation endpoints without an occurrence. An explicit selected-axis value places a record in Dated on [selected axis]; a missing value places it in Unplaced; switching axes may move it between subgroups without changing subtype/source identity. Dated grouping/order is deterministic and never enters claim geometry.
13. Occurrence, actor-claim, action, source, and topic/unknown question origins resolve conservatively; multi-origin questions appear once; action/source origins do not borrow claim-body tethers.
14. Coverage strip preserves every role/count/zero and lenses do not remove or mutate occurrence or non-claim material.
15. Matrix/Relation-summary mode changes only presentation, visibly announces simplification, and preserves every relation in exactly one authoritative semantic ledger entry across 3/5/8-source fixtures.
16. Public, accessible, and wireframe copy uses **Complete relation review ledger** or **Candidate relation ledger**, Prepared case record, Prepared source record, and Needs review; raw technical status is not primary public wording.
17. Visual relation shortcuts share the same `relation_id`, semantics, and detail target as the ledger; decorative SVG is absent from the accessibility tree.
18. Full claim text remains in semantic DOM when visually clamped; expand/inspect provides full visual access without duplicate speech.
19. Prepared/live/fallback packets—including occurrence-bearing packets with only Publication, only Actor assertion, or only Retrieval values and zero-occurrence packets with/without source Publication—use one presentation grammar while retaining their boundaries.
20. Semantic DOM, accessible names, skip targets, fixed row/chapter order, keyboard scroll, inspector focus loop, Escape, and focus/scroll restoration.
21. `>1200`, `921–1199`, `<=920`, `390`, and `360` layouts have no page-level horizontal overflow and retain the same entities, fixed row types/order, relation count, origin types, non-claim Dated/Unplaced placement, and time semantics.

### Can implement now using the current packet

- occurrence primary nodes;
- one prepared multi-occurrence Candidate thread, one prepared Standalone claim occurrence, and a generic Ungrouped claim occurrence fallback;
- all four selected axes on occurrences;
- the complete occurrence-primary initial-axis chain and zero-occurrence source-Publication/Retrieval fallback as derived presentation behavior;
- one fixed displayed-packet row ordinal and presentation-local thread numbering;
- current three occurrence-level relations;
- current three unresolved questions with typed conservative origins and action chips;
- source role/title/publisher attachments;
- current coverage counts/lenses;
- editorial Non-claim source record as Context / interpretation in Unplaced on Event time and Dated on Publication time at Jun 15, 2026, 08:00;
- occurrence/source/relation/question inspector transitions;
- composite selected-axis arrow eligibility;
- Matrix and Relation-summary modes with a **Complete relation review ledger**;
- desktop matrix, tablet contained scroll, and typed mobile chapters.

### Desirable later data/model improvements

These are optional later improvements, not prerequisites and not part of this UI task:

- a reviewed, human-readable candidate-family display label;
- explicit reviewed family identity/order distinct from candidate grouping;
- contract-level bidirectional/unique family-membership validation;
- explicit question origin type/target IDs so action/source/occurrence resolution need not be reconstructed in presentation;
- explicit reviewed relation semantic direction separate from chronological left/right ordering;
- optional reviewed non-claim source classification.

None should be smuggled into the initial production Map redesign.

## L. Implementation risks and mitigations

| Risk | Failure if ignored | v1 mitigation |
| --- | --- | --- |
| Sparse claim-family data | Rows look empty or falsely authoritative | Exact typed rows; Candidate thread only for consistent multi-occurrence families; standalone/ungrouped fallbacks |
| One-claim families | A single point looks like demonstrated lineage | “Standalone claim occurrence · grouping unresolved”; no thread number or continuation rail |
| Overlapping relations | Labels/cards obscure claims | Short line labels, reserved channels, collision measurement, adaptive Relation-summary mode, complete ledger |
| Many sources | Provenance repeats and canvas widens | Sources do not define columns; compact attachments; typed Non-claim section; max-8 coverage still visible |
| Many claims | Excessive row/card height and tab stops | Typed chapters, visual clamp with full semantic text/expand action, adaptive density controls; never silently drop nodes |
| Long claim text | Cards dominate and accessibility repeats prose | Full claim stays in semantic DOM; CSS clamp plus Expand/Inspect; no redundant full-text `aria-label` |
| Relation crossings | Interaction pattern becomes unreadable | Intra-row routing first; stable cross-row channels; switch to announced numbered ports when measured presentation density requires it |
| Axis changes reorder rows | A stable claim lineage appears to change identity when only the time lens changed | Derive one packet-local ordinal from the initial axis; preserve it across axis/responsive transitions; recompute only for a new packet |
| Presentation-local T number escapes | Review-local navigation looks like a stable family ID | Generate numbering only from the displayed-packet ordinal; never persist/export it or use it as public identity |
| One source with multiple claims | Source-card endpoint is ambiguous | Separate occurrence nodes sharing one provenance attachment identity |
| One claim linked to multiple sources | Merging loses source-local support differences | Separate occurrences per source; optional exact `claim_id` sibling indicator; never merge support |
| Sources with no occurrence | Everything is mislabeled Context or forced into a claim row | Neutral Non-claim source record base; five supported subtypes; Dated/Unplaced source subgroups; Source-only fallback; never a claim-relation endpoint |
| Action/finding-bearing no-occurrence source | Record semantics disappear under a Context label | Action-bearing, Finding-bearing evidence, or Mixed non-claim subtype; full linked records in inspector/Sources |
| Dated non-claim source | An explicit time pulls a source-only annotation into a claim row or relation endpoint | Place it only in Dated on [selected axis] with deterministic grouping; keep source identity/subtype and all relation exclusions |
| No explicit event time | Another date gets substituted or a source-only action forces Event as initial axis | Occurrence-primary chain continues to Publication, Actor assertion, then Retrieval; zero-occurrence packets use source Publication else Retrieval; explicit Unplaced bands remain field-specific |
| All-Unplaced initial matrix | Initial axis is chosen from unrelated context/action data or an absent occurrence field | Use the full occurrence-bearing fallback chain and separate zero-occurrence rule; never use action/context Event time to force the initial claim matrix |
| Question linked to multiple records | Duplicate questions or false single-row assignment | One rail card with multiple typed origins; only occurrence/claim origins tether by default |
| Action-linked question | Action is visually turned into a claim | `Via action record` chip with action + source identity; no claim-body/provenance tether |
| Source-linked question | One arbitrary occurrence appears to own a source-level gap | Source-origin chip or one unique non-claim source anchor; no arbitrary occurrence tether |
| Unknown question origin | UI invents a source or occurrence | Topic / unknown evidence-gap origin only |
| Family membership inconsistency | Presentation invents grouping | Cross-check both directions; isolate each affected occurrence in ungrouped row |
| Mixed/day precision | Layout invents within-day chronology | Exact sub-band + unordered day-peer band; suppress temporal arrowhead |
| Equal retrieval times | Stable order is misread as chronology | Shared-time peer group; explicit equal-time/record-order copy; no arrow based on X |
| Relation endpoint order | Engine record order is mistaken for reviewed semantic direction | Four-condition composite arrow rule; Challenges always non-directional; ledger states when direction is not asserted |
| Accessible edge plus ledger | One relation sounds like two records or semantics diverge | Exactly one authoritative semantic entry per `relation_id` in the Complete relation review ledger; synchronized shortcuts; decorative SVG |
| Mobile density | Relation shortcuts and provenance overwhelm the path | Typed chapters, full-width targets, announced Relation-summary mode, expanded ledger, collapsed coverage disclosure, modal inspector |
| Candidate/prepared-record conflation | A Prepared source record appears to approve a Needs review claim or candidate relation | Separate occurrence/source boundary labels; use plain-language public status; keep raw technical status out of primary public wording |
| Model summary conflation | Summary appears to be captured source text | Keep content-kind boundary in source attachment/inspector and Sources; never quote it as source page text |

## M. Recommendation

Adopt the **Temporal Claim-Lineage Matrix with Adaptive Relation-Summary Mode** for independent design approval before implementation.

It is superior to the current source-role swimlane because the coordinates, nodes, and relation grammar answer one primary question. X means explicitly selected time. Y distinguishes a review-needed multi-occurrence Candidate thread from a Standalone or Ungrouped occurrence, in a packet-local order that remains fixed across axis changes. Nodes mean source-local claim occurrences. Spatial edges and synchronized ports mean candidate relation types requiring review. The user follows claim occurrences through change and interaction without mistaking source roles for lineage.

The design preserves the useful parts of the current Map:

- explicit selected Event/Actor assertion/Publication/Retrieval semantics, the complete occurrence-primary initial-axis fallback, and no missing-time substitution;
- day/mixed precision honesty and the separately named Unplaced band;
- candidate/review-only family and relation boundaries;
- occurrence-primary nodes with source provenance attachments;
- complete Sources/Method auditability and the model-summary-versus-captured-text boundary;
- the complete source-role coverage strip, including zero/missing roles;
- one non-chronological Unresolved rail with typed origins;
- non-mutating lenses and typed row traces;
- one **Complete relation review ledger** with one authoritative semantic entry per `relation_id`, including every candidate record in both density modes;
- focused inspector and responsive accessibility behavior;
- mobile typed claim chapters;
- fixed packet-local row/chapter order across axis changes, with presentation-local T numbering only;
- Non-claim source Dated/Unplaced subgroups that preserve subtype and source identity across axis changes;
- prepared/live/fallback and candidate/review-only boundaries;
- `canonical_mutation: none`.

Information that moves out of the primary canvas includes full source-card identity, counts, long previews, URLs, domain, snapshot mechanics, coverage methodology, long relation reasoning, support excerpts, and full findings/actions. Those remain in Sources, Method, the **Complete relation review ledger**, and inspector. Sources with no occurrence remain visible as neutral Non-claim source records with accurate presentation subtypes and Dated/Unplaced placement rather than becoming fake claim nodes.

Information that becomes more prominent includes original actor claim text, claim occurrence status, exact row type and grouping uncertainty, occurrence-to-occurrence candidate relation semantics, selected-axis placement or named Unplaced state, and unresolved evidence questions with truthful origin types.

A user should understand faster:

1. There are three claim occurrences, not four equivalent source nodes.
2. The Jun 10 and Jun 14 city occurrences form one Candidate thread that still needs review.
3. The Jun 12 community occurrence is standalone with unresolved grouping—not an established thread—while R2 Challenges without direction and R3 may show selected-axis progression only when the composite rule passes.
4. The editorial source is a Context / interpretation subtype of Non-claim source records, not the generic identity of every source lacking an occurrence.
5. Q1 traces through its matching claim occurrence; Q2/Q3 originate via actions and do not attach to an arbitrary claim body.
6. The three questions remain unresolved evidence needs, not later events or conclusions.
7. Every relation remains listed and review-only even when the spatial overview is simplified.
8. Changing time axes moves occurrences horizontally and Non-claim records between Dated/Unplaced subgroups without changing the vertical claim-row order.

The remaining tradeoffs are real. Candidate families do not provide trusted public names, and their fixed display order is a packet-local viewing aid rather than reviewed semantics. Matrix mode can still produce cross-row crossings. The adaptive mode preserves records but reduces at-a-glance network shape. A matrix above 920px needs contained horizontal scrolling for larger packets. Mobile necessarily relies more on relation shortcuts and the review ledger. Derived non-claim subtypes and question origins must fail closed when packet links are sparse. These costs are preferable to retaining a source-role coordinate that obscures the product’s core claim-lineage purpose.

## N. Independent-review gate

**Do not implement the production redesign from this document without a separate authorization after independent design review.**

The reviewer should specifically decide:

1. Do Candidate thread, Standalone claim occurrence, and Ungrouped claim occurrence labels prevent family data from overstating lineage?
2. Do the five Non-claim source record subtypes preserve action/finding/context/source distinctions without adding packet semantics?
3. Does the typed question-origin model keep Q2/Q3 action origins clear without arbitrary claim-body or provenance tethers?
4. Is the composite arrow rule conservative enough given the absence of reviewed semantic direction, including R2’s unconditional non-directionality?
5. Do Matrix and Relation-summary modes preserve one coherent grammar, a visible simplification boundary, and every candidate relation in the Complete relation review ledger?
6. Does the below-matrix Unplaced band remain distinct from both chronological time and the Unresolved rail?
7. Do mobile typed chapters, fixed packet-local row order, and the Complete relation review ledger preserve the same conceptual and accessible grammar?
8. Is scan-level provenance sufficient for auditability while full source mechanics stay in inspector/Sources?
9. Does the occurrence-primary initial-axis chain avoid opening an all-Unplaced primary matrix without substituting time meanings?
10. Do Non-claim source Dated/Unplaced subgroups keep dated source annotations outside claim lineage and relation geometry?

Requested outcome: independent design review of this revised proposal only. This document remains a proposal, not implementation authority until that review approves it and separate implementation authorization is granted.

- Production application files changed in this proposal: **0**.
- Production test files changed in this proposal: **0**.
- Provider/OpenAI calls: **0**.
- Hosted/API/D1/Sites/deployment/access changes: **0**.
- Merge/auto-merge: **0**.
