# Artist pilot kit

Preparation for studio-tracker #189. These are operating materials for a small,
consenting pilot, not a public launch, a claim of recruitment, or evidence of
sales. All invitations in this kit are unsent.

## What the pilot should decide

Can an artist put a useful gallery on a site they control, connect it to another
artist, and take their work elsewhere without technical help? Does the result
help visitors understand and contact the artist? Which optional services solve
a problem the artist already spends time or money on?

Recruit five artists and ten visitors. At least three artists and most visitors
should be unfamiliar with Nostr. Ask about familiarity; do not infer it from an
artist's subject matter, public profile or use of Bitcoin. Include these
workflows across the cohort, allowing one person to cover several:

| Workflow | Minimum coverage | Why it matters |
| --- | --- | --- |
| Website builder with an existing portfolio | 1 artist | Tests link/embed setup and plan limitations |
| WordPress or a static site the artist controls | 1 artist | Tests a different installation path |
| Physical paintings or prints | 1 artist | Tests explicit dimensions, editions and label needs |
| Nostr familiarity | 2 artists | Tests the optional signing and portability path |
| No Nostr experience | 3 artists | Tests value without a protocol lesson |

Do not recruit only collaborators who helped design the product. An assisted
technical rehearsal may find bugs, but is not one of the five scored artist
sessions. Ask about accessibility needs and offer a text/list route without
requiring a participant to disclose a diagnosis.

## Readiness before invitations

The owner records these gates in the private study folder. A missing gate blocks
the corresponding task; it does not become a successful result by being omitted.

- TJ approves the exact cohort, sender, professional contact route and invitation.
- The study owner fills in dates, participant time, compensation (including if
  none), support contact, storage location and deletion dates in the templates.
- The participant-facing setup flow works without a terminal or Git. The existing
  importer and portable-gallery CLI are engineering tools; facilitator use of
  them cannot be counted as artist self-service.
- The maintained engine has a supported custom-catalog entry point and a tested
  synthetic gallery. The painting-data adapter alone is not a rendered 3D test.
- Each website-builder path has been checked on the participant's actual plan.
  A purchased plan, new account or upgrade is never assumed or purchased for them.
- Local/private practice is available. An artist's live-site task needs their
  separate approval and TJ's authorization to proceed with deployment. Current
  development instructions do not authorize public deployment.
- The linked destination and expected artist identity are confirmed. An ordinary
  web link is labeled unverified; it cannot be scored as a verified Nostr gate.
- A known-good backup and rollback are prepared, and the chosen build is pinned
  by commit. The same build is used across a scored cohort unless a blocker
  requires a change; report the change rather than combining incompatible results.
- The observer rehearses all tasks using synthetic work and the same instructions.

Related implementation: own-site setup (#182), narration (#183), Nostr integration
(#186) and readiness/recovery (#196). The portable-gallery work in
[Relay Gate PR #3](https://github.com/timothyjosephmurphy/relaygate/pull/3) offers a
testable local export/restore path. It does not by itself meet the no-terminal
installation target, nor verify Nostr signatures or operate a complete 3D engine.

## Invitation and preparation

Use the [unsent drafts and permission records](artist-pilot-templates.md), then
record each invitation, decline, no-response and withdrawal in a private log.
Public professional prospects and the evidence behind them are in
[the source appendix](artist-pilot-prospects.md). A source list is not permission
to contact, enroll or display anyone's work.

Each artist selects 5-10 works, supplies or confirms display rights, and has
their own site login available privately. Request titles, source URLs, media,
year, explicit physical dimensions if known, a short description and alt text.
Unknown dimensions stay unknown. Pixel dimensions are not painting dimensions.
Do not import a whole portfolio merely because the artist supplied one example.

Explain beforehand that the study tests unfinished software. The artist keeps
copyright and chooses whether anything is displayed publicly. An invitation is
not a sales request, an endorsement request, or permission to record.

## Artist session: approximately 45 minutes

Use the facilitator script in the templates. Start by asking about a recent
exhibition before showing features; record observed behavior separately from
opinion. No feature pitch is needed to establish whether a problem exists.

| Stage | Suggested time | Observer action |
| --- | --- | --- |
| Scope and permissions | 5 minutes | Confirm the choices and stop/withdrawal route; recording defaults off |
| Existing workflow | 5 minutes | Ask the artist to explain their last exhibition/update and where help was needed |
| Timed setup | Up to 15 minutes | Observe the tasks below; use neutral prompts; log every intervention |
| Export, restore and optional features | 10 minutes | Test recoverability separately; optional signer/story tasks cannot block viewing |
| Debrief and service choice | 10 minutes | Ask what to keep, remove, or pay someone to do; agree only a next research step |

### Define the 15-minute clock before the session

Assets are ready when the artist has selected the permitted files/URLs and knows
which five or more works to include. Login to the existing host may be completed
before the clock, with no credentials shown to the facilitator. DNS propagation
and a separately documented host outage are excluded and reported by duration.
Import, metadata review, correction, gallery configuration, installation and
checking the visitor URL are included. Do not pre-build the artist's gallery and
then time only the final link click.

Start when the artist begins the first setup action. Stop when the gallery works
on their approved site, shows the intended works, and the intended outward gate
opens. Pause only for a participant-requested break or an excluded host/DNS
condition; log wall time, excluded time and active time separately. A product
error, confusing interface, missing feature, or facilitator repair stays in the
active time.

Ask the artist to:

1. Start with the permitted website URL or manually supplied images.
2. Select five or more works and remove a non-artwork candidate if one appears.
3. Correct one title and one explicit physical size. If no real size is known,
   leave it unknown and use a synthetic practice item for the editing task.
4. Add one useful image description and review the artist contact destination.
5. Save a draft, leave the editor, and reopen it without losing changes.
6. Install the gallery using the chosen own-site path, then open the visitor URL.
7. Add an outward gate to the approved destination and follow it. Explain what
   the link's identity label means. Reciprocal linking is a separate approval.

A participant can read product help or the normal installation guide. If the
observer points to the right control, dictates steps, uses a terminal, edits
configuration, or takes over, record assisted completion. After 15 minutes,
continue only if the artist wants to; keep the original result as over target.
Never turn an unsuccessful timed run into a pass after a hidden repair.

### Export, restore and exit

This is outside the setup clock and scored separately:

1. Have the artist export the reviewed gallery and save the complete folder.
2. List included media, remote-only media, stories and exact signed event files
   if present. Explain that remote-only media can disappear.
3. Restore in a fresh approved local/private directory without the original
   service account. Compare work count, stable IDs, corrected title/size, story,
   source/rights notes and available media. Record hashes or an inventory report.
4. Simulate original-host loss using a synthetic local fixture, not an artist's
   live site. Confirm that included files remain readable and missing remote
   media is reported. Never delete the original to test recovery.
5. If a move to another host is authorized, separately verify its visitor URL,
   media paths, contact links and gates. A local data restore is not a deployed
   site migration, DNS transfer, or recovery of an unavailable signing key.
6. Demonstrate rollback to the saved prior version and removal from the local
   gallery. Explain that previously published relay events or third-party copies
   may remain. The pilot does not promise deletion from every relay.

Optional Nostr signing is scored only after the implementation is ready and the
artist chooses it. The artist controls the external signer; the researcher never
requests, views or enters a private key. A skipped signer step is not a failure
of the guest-viewing path. Record signed identity and relay recovery separately.

## Visitor session: approximately 15 minutes

Use ten consenting visitors, with five assigned list-first and five 3D-first.
Randomly assign participants within that balanced split before sessions. Keep
the same permitted works and task difficulty in both views; use different,
comparable works for the second view to reduce answer recall. Record order and
target IDs. Score the core visitor target from the first assigned view; the
second view is an exploratory comparison and cannot erase a first-view failure.
Do not present ten observations as a statistically representative market survey.

Core prompts, without showing the answer or naming a control:

1. Find the specified work and show its title.
2. Explain its story and its physical size, including when size is unknown.
3. Find how to contact the artist. Stop at the contact link; do not send a message.
4. Follow the outward gate and say whose gallery you reached.
5. Optional: find the support/payment control and explain what would happen.
   Use a simulation only; never enter payment details or send funds in this study.

Observe on the visitor's normal device where practical. Record browser, viewport,
input method and relevant network profile. Ask one willing visitor to use keyboard
navigation and include assistive-technology users through voluntary recruitment.
Do not claim accessibility compliance from these sessions alone.

If 3D causes discomfort, stop it immediately and offer the list view. Record the
3D task as stopped and the fallback result separately. Account creation, a wallet,
a signer, forced audio or forced motion must not be prerequisites for core tasks.

## Scoring and decisions

Every task gets one outcome: independent success, assisted success, failed,
stopped by participant, blocked by unready feature, or not tested. Never count
blocked/not-tested as success. Use the [task and summary forms](artist-pilot-templates.md)
to preserve denominators and distinguish observations from interpretations.

| Criterion | Pass rule for this pilot | If it misses |
| --- | --- | --- |
| Artist own-site setup | At least 4 of 5 complete in 15 active minutes without procedural help, terminal or Git | Fix setup blockers and repeat with a new or clearly labeled repeat cohort |
| Visitor core access | At least 8 of 10 independently view/find/contact without account creation | Fix the guest route before expanding features |
| Data portability | All 5 export and restore reviewed data with the specified fidelity | Treat missing/corrupted data as a release blocker |
| Follow-through | Obtain a concrete decision from at least 3 artists: second exhibition request, defined service interest, or decline with a reason | Continue discovery; do not rename politeness as demand |
| Safety/permissions | No unapproved display, recording, payment, disclosure or signer access | Stop the affected work, contain exposure and document corrective action |

Report second-exhibition requests, paid-service interest and declines in separate
counts. Three declines satisfy decision coverage, not demand. Interest in a quote
is not a booking; a booking is not collected revenue. Keep compensation to study
participants separate from service sales.

Do not silently replace a dropout. Record invited, consented, started, completed,
declined and withdrawn counts. A participant who starts then withdraws remains
in the reported started denominator, subject to their data-deletion choice.
If deletion removes their task data, report that a record was withdrawn without
publishing details. Recruit a replacement only as an additional, labeled case.

## Close the loop

At session end give the artist their gallery/backup, a plain list of what remains
private or live, and the exact support/deletion contact. Confirm the date for any
follow-up they requested. Do not subscribe them to marketing or introduce them
to another participant without permission.

Store completed forms outside this public repository and outside public issues.
Use participant codes in engineering tickets. Strip filenames, URLs, quotations
and device details that would identify a participant from public examples unless
they explicitly approve that disclosure. Aggregate findings can inform development;
publication of a report or case study needs separate TJ approval and the recorded
participant permissions. No names, endorsements or testimonials are pre-approved.

After all sessions, use the summary form to recommend one of: repair and retest,
continue a limited private pilot, or request approval for a wider release. This
document does not authorize any of those next actions by itself.
