# Event-day runbook

Assign a lead operator, a backup operator and a network contact. Keep the canonical application URL, both public-display URLs and the recovery procedure accessible offline. Use one primary event interface; an internal generation only separates data cleared by reset.

## Before the final event

- [ ] Staging and production point to separate Supabase projects. Destructive test flags are absent in production.
- [ ] TypeScript, lint, unit, SQL, browser, native concurrency and managed-provider integration gates have passed; review recorded results, not only commands.
- [ ] Production database and deployment are healthy. Developer login works on a second device.
- [ ] Backup strategy is active; a restoration rehearsal has succeeded. Exports can be downloaded and opened.
- [ ] Event name, registration fields and required fields are correct. Event ID rule and sample collision handling were rehearsed.
- [ ] Participant maximum is 120, chatbot maximum 10, duration 60 minutes, or the explicitly approved alternatives. Calculated target is correct (defaults: 1,200).
- [ ] Public name/department/custom-field disclosure is intentional. Private register numbers and authentication identifiers are not visible.
- [ ] `/display/leaderboard` and `/display/progress` work on the actual projector/TV. Fullscreen, font size and visible columns are readable.
- [ ] Event Wi-Fi supports the expected devices. Test registration/login bursts and reconnect on the actual network.
- [ ] Realtime reports Connected and an independent browser updates. Disconnect/reconnect one browser and verify authoritative recovery.
- [ ] Export test evidence; end the test event; use PREPARE CLEAN EVENT with typed phrase and final confirmation.
- [ ] Confirm DRAFT, zero active participants/submissions/completions, preserved developer/configuration, new data generation and reset audit entry.
- [ ] Open registration. Verify one intended registration and Event ID. Correct collisions before the event starts.

## Start

1. Compare the registered participant count with attendance and capacity.
2. Close registration. Inspect the participant list and public displays.
3. Set READY. Ensure all participants know that each chatbot needs deployment **and** verification confirmation.
4. Start LIVE when organizers announce the start. Database time starts the shared timer.
5. Observe one complete participant workflow: draft → deployed → verified, participant count, leaderboard row, master total and developer completion feed.

## During the event

- Keep Overview, Live completions and System health available. Watch last sync, realtime state, remaining time and consistency.
- Use server records to answer whether a confirmation succeeded. A disconnected device may have committed successfully; synchronize before retrying.
- Avoid unnecessary configuration changes. A lower limit conflicting with records is rejected; do not bypass it.
- Corrections require an explicit reason. Inspect the participant and chatbot before changing timestamps, deleting or resetting.
- To pause, use Event control → PAUSED. Submission actions stop and remaining time freezes. Resume adds the elapsed pause to the deadline.
- If the timer expires, new participant mutations are blocked even before the operator presses End. Explicitly end the event to record the lifecycle action.

## Incident responses

**One device loses connectivity:** participant waits for reconnection and synchronizes. Keep the same pending request. Do not ask them to recreate a chatbot that already exists in the database.

**Realtime fails:** snapshots continue to reconcile periodically and on manual refresh. Check whether database/API mutations work. Do not switch to a manual frontend tally.

**Widespread network/database outage:** pause if reachable; record the incident and organizer decision externally. Do not backdate participant confirmations to browser times. Resume only after authoritative records and timer agree.

**Wrong chatbot verified:** developer inspects the record, enters a correction reason, removes verification if warranted and confirms the official total changed once. Audit preserves the prior milestone. Participants cannot secretly overwrite confirmed evidence.

**Accidental removal:** use Include removed → Restore, resolve sequence/capacity conflicts explicitly, and verify counts.

**Accidental full clean reset:** stop new actions, preserve logs/exports and follow the isolated backup restoration procedure in DEPLOYMENT.md. Do not edit generation numbers manually.

## After the event

- [ ] Explicitly END the event and confirm participant competition modifications are blocked.
- [ ] Run System health reconciliation. Qualifying chatbot rows = participant sum = leaderboard total = master total.
- [ ] Review recent corrections/removals and all official records underlying the total.
- [ ] Export participants, all chatbot submissions, verified completions, timeline and audit.
- [ ] Record the final generation, official total, export time, application version and responsible operators.
- [ ] Verify CSV files open safely; retain protected copies with the database backup. Preserve UTC timestamps and full audit detail.
- [ ] Keep the final event frozen. Do not use PREPARE CLEAN EVENT until the organizers explicitly authorize clearing active competition data and evidence preservation is complete.

The application records event evidence; it does not itself certify a legal world record.
