# Artist-approved guide stories

This implements the local narration, approval and visitor-playback portions of
studio-tracker #183. It runs independently of the unmerged gallery/importer
work and has no new package dependency. The shared 3D engine still needs a
supported integration entry point. No artist recording, voice model, published
story, external signer action or live usability study is claimed.

## Try the development example

Serve this checkout through your development HTTP server and open
`examples/teach-guide.html`. On your own machine, one option is:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8080/examples/teach-guide.html`. Microphone capture
requires a secure browser context such as HTTPS or localhost. The example
does not upload files, call a model, sign events or deploy a website.

Choose **Teach the five demo works**, or select a `relaygate/gallery/1` config.
Select a painting and confirm the displayed title before recording. You can
type a story, upload an audio file, or consent and start the microphone. Pause,
resume and stop controls are available. Start another recording to retry;
the new take becomes a draft and needs approval again.

The transcript is typed or pasted and editable. This version does not send
audio to a transcription service. Review the transcript and rights statement,
then separately approve public export, attached audio and any summary. Public
export includes only active approved revisions. **Approval is a local editorial
action, not a cryptographic artist signature.**

The visitor preview offers original audio with native volume/pause controls,
the original-language transcript and a clearly labelled approved summary.
There is no autoplay. Audio and text are embedded in the export, so playback
does not require the original host or a model call. Browser audio codec support
still determines whether a given recording format can play; retain the text.

## Data and revision contract

`src/narration.js` provides immutable-style state transitions (new copies),
bounded schemas and content-addressed revision records:

- `createStoryStore(gallery)` establishes the artist and stable work IDs. An
  optional `artist.pubkey` is a public hex key. Works may carry an addressable
  `coordinate` and an exact source `eventId`; neither is required for local use.
- `selectWork` returns a detached copy. `saveDraft` edits only private draft
  fields and preserves the work ID/base revision.
- `approveStory` requires explicit review, public-export consent, recording
  rights when audio exists, summary review and review of every translation.
  It hashes the approved payload and links the previous exact local revision.
- `withdrawStory` removes the active story from future local exports while
  retaining private history. It cannot recall previously downloaded copies.
- `exportApprovedStories` omits all private drafts, withdrawn works and old
  revisions. `parsePublicStories` checks the schema, revision/audio hashes and
  work linkage before visitor use. These hashes detect changes, not authorship.
- `parsePrivateStories` restores the full private history and drafts. A private
  backup must never be placed in the public website folder or on relays.

Room placement and titles are not story keys. A story remains attached to its
stable work ID and master coordinate when the gallery is rearranged or a title
is corrected. The story also retains the exact artwork event it referenced at
approval time, even if the current catalog later references a newer event.
Public exports take the display title/order from the current catalog, but take
both `work.coordinate` and `work.eventId` from the approved revision. Public
imports reject any disagreement with that revision's source references,
including substitution or removal of an exact event ID. Approve a new revision
to associate the story with a newer source event. Export strips unknown catalog
metadata; import rejects unknown story/work/revision fields so private notes
cannot pass through a public record unnoticed.

The browser panel uses IndexedDB for local draft recovery and allows explicit
private-backup download/restore. Browser storage can be cleared or denied; a
save failure is shown and the in-memory draft can still be downloaded. Local
storage is not an off-device backup. The current panel requires a matching
artist and artwork set when recovering; adding/removing works needs an
explicit migration rather than silently dropping draft stories.

The archive has a 64 MiB total limit, 10 MiB audio-file limit and 30,000-character
transcript limit. Recording stops at three elapsed minutes or the size limit.
For long stories, use shorter segments or an externally edited audio file.
The API supports chapters, approved translations and approved Q&A entries;
their full editing UI is a later integration step. The basic panel refuses to
approve imported translations it cannot display for review.

## Engine integration

```js
import { mountTeachingPanel, mountVisitorStory } from './src/narration-panel.js';

const teaching = await mountTeachingPanel(artistPanel, {
  gallery,
  storageKey: 'this-artist-gallery',
  onSelectWork: workId => engine.focusArtwork(workId),
});

// Call from the engine's explicit artwork-selection handler:
await teaching.select(workId);

// In visitor mode, after loading the exported public JSON:
const visitor = await mountVisitorStory(visitorPanel, publicStoryJson, workId);

// Release microphone tracks, audio object URLs and storage on route changes:
await teaching.dispose();
visitor.dispose();
```

The host owns authentication for any remotely shared artist workspace. The
example is a local editor; putting its HTML on a public site does not create an
authenticated server or allow anyone to change a remote canonical collection.
Integrate it with the engine's existing selected-work event and artist mode.
Do not attach recordings by screen position, room index or title.

The UI constructs text nodes and uses native controls. Transcript and question
content is never inserted with `innerHTML`, interpreted as instructions or sent
to a tool. The core recorder asks for microphone access only in `start` after
explicit consent, stops tracks on completion/error/cancellation and bounds the
recording. The host should allow audio `blob:` URLs in its CSP and keep scripts
restricted to its own assets. Serve scripts with correct JavaScript MIME types.

## Grounded guide answers

`answerFromApprovedStory` matches an approved question after case/spacing
normalization and returns the exact artist-approved answer with its revision
source. Any other question receives “The artist has not supplied an answer to
that question.” It never guesses biography, intent, price or provenance and
never edits a story. There is no semantic model in this version. Visitor
questions are not persisted or transmitted; future question collection needs
its own visible consent and retention decision.

Generated translations and summaries must remain drafts until reviewed.
Original text remains alongside approved translations. No voice cloning or
synthetic impersonation is implemented. An optional generic TTS layer would
need disclosure and must not block original-audio/text playback.

## Nostr boundary

`longFormDraft` prepares an **unsigned** kind 30023 NIP-23 event from an approved
revision. It carries the artist public key, stable `d` identifier, artwork `a`
and exact-source `e` references where available, and a namespaced local revision
tag. It does not create an event ID/signature, call a signer or publish to relays.
Transcripts are plain text: the draft escapes Markdown syntax and HTML rather
than interpreting artist text as headings, links, images or embedded markup.
The original approved transcript is retained unchanged in the story archive.
The audio/story linkage convention still needs an interoperability review;
this implementation does not claim that `relaygate-revision` is standardized.

NIP-94 kind 1063 is a candidate for separately hosted approved audio metadata,
but this local kit neither hosts audio nor invents a public file URL. Keep the
exact approved audio hash in the portable bundle. External signing through
NIP-07/46/55 belongs to the separate signer integration. The application never
asks for or processes a private signing key.

References: [NIP-23](https://github.com/nostr-protocol/nips/blob/master/23.md),
[NIP-94](https://github.com/nostr-protocol/nips/blob/master/94.md),
[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder),
[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase).

## Evidence and remaining acceptance

Run `npm test`. The tests cover a five-work approval/replacement/export flow,
title/order changes, private recovery, exact audio round-trip, checksum errors,
separate generated-material consent, withdrawal, malformed input, adversarial
Q&A, and recorder permission/resource lifecycle with injected fake devices.
No microphone is used by the tests.

Still required before closing #183:

1. Integrate the panel into the maintained Three.js engine and guide avatar;
   verify selected-work highlighting while the artist walks around.
2. Have an artist record/edit/approve/replace/export five real paintings without
   typing event IDs or using a terminal. Measure editing time and comprehension.
3. Manually test keyboard and screen-reader use, mobile recording formats,
   captions/transcript readability, storage denial, reload/recovery and offline
   playback in actual browsers. Unit tests are not an accessibility audit.
4. Choose draft/audio retention and off-device backup policy, then review the
   Nostr story/audio mapping and external signer flow before publication.
