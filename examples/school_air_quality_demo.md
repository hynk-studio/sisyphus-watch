# School Air Quality Alert: Safety Dashboard vs Classroom Reality

Synthetic demo scenario ID: `school_air_quality_alert_communication`

## Source Fixtures

- `src_school_air_quality_initial_notice_2026_06_16`
- `src_parent_teacher_air_quality_observation_2026_06_17`
- `src_school_air_quality_corrected_update_2026_06_18`
- `src_editorial_school_air_quality_transparency_note_2026_06_19`

## 3-Line Summary

1. The fictional district said classroom air-quality readings were within safe limits after a ventilation/filter issue.
2. Parent and teacher observations later reported stale air, late notices, inconsistent dashboard readings, and confusing temporary relocations in several rooms.
3. The district corrected the dashboard, identified rooms without current readings, deployed portable HEPA units, clarified thresholds, and explained sensor calibration and data-sync delays.

## Authoring Workflow Dogfood

The scenario was promoted by dogfooding the v0.7 authoring workflow: the template validated, the checklist passed, a draft skeleton was generated, and that skeleton was filled into an evidence-bound deterministic `news_card`. The completed card then passed news-card validation, graph validation, agent packet export, graph packet export, and reviewer packet export.

The draft skeleton remains an authoring aid only. It is not mixed into production demo records.

## Claim Drift Example

`claim_school_classrooms_safe_2026_06_16_001` drifted from `unverified_dashboard_safety_claim` to `partially_challenged_by_room_level_observations`.

The broad classroom safety claim weakened after room-level observations and the corrected update identified rooms without current readings.

## Path To Verdict Example

`Fictional Unified School District` -> `v00` -> `v01_after_room_observations_and_corrected_update` -> `Air-quality communication gap with partial remediation`

This path shows the initial district claim flowing through the version timeline and version diff into the current source-bound judgment.

## Reviewer Preset Example

Preset: `claim_status_review`

Focus claim: `claim_school_classrooms_safe_2026_06_16_001`

Answer summary: the claim is currently handled as `partially_challenged_by_room_level_observations` and has weakened drift in the card history.

## Limitations

This is a synthetic fixture, not real news. No independent verification, live ingestion, crawler, database, graph service, or external API was used.
