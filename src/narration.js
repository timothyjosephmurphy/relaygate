// Portable, local-first story records. No network, signer, model or microphone.
export const PRIVATE_SCHEMA = 'relaygate/narration-private/1';
export const PUBLIC_SCHEMA = 'relaygate/narration-public/1';
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_TEXT = 30000;
const hex = /^[a-f0-9]{64}$/;
const clone = value => structuredClone(value);
const required = (value, name, limit = MAX_TEXT) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`${name} is required and must be at most ${limit} characters`);
  return value.trim();
};
const optional = (value, name, limit = MAX_TEXT) => value == null || value === '' ? '' : required(value, name, limit);
const id = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) || value in Object.prototype) throw new Error('Invalid stable artwork ID');
  return value;
};
const language = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value)) throw new Error('Use a language tag such as en or fr-CA');
  return value;
};
const timestamp = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Time must be a non-negative Unix timestamp in seconds');
  return value;
};
const now = () => Math.floor(Date.now() / 1000);
const bytes = text => new TextEncoder().encode(text);
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
function bounded(value) {
  if (bytes(JSON.stringify(value)).length > MAX_ARCHIVE_BYTES) throw new Error('Story archive exceeds 64 MiB; export smaller collections');
  return value;
}
function checkStore(store) {
  if (store?.schema !== PRIVATE_SCHEMA || !Array.isArray(store.works) || !Array.isArray(store.revisions) || !store.drafts || !store.active) throw new Error('Unsupported private story archive');
}
function workFor(store, workId) {
  checkStore(store);
  const work = store.works.find(w => w.id === workId);
  if (!work) throw new Error('Select a known artwork before teaching the guide');
  return work;
}
function audioType(value) {
  if (typeof value !== 'string' || !/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(?:;codecs=[a-zA-Z0-9., -]+)?$/.test(value)) throw new Error('Unsupported audio type; use WebM, Ogg, MP4, MP3 or WAV');
  return value;
}
function audioBytes(audio) {
  if (!audio || typeof audio !== 'object' || !hex.test(audio.sha256) || !Number.isSafeInteger(audio.bytes) || audio.bytes < 1 || audio.bytes > MAX_AUDIO_BYTES) throw new Error('Invalid audio metadata');
  audioType(audio.mimeType);
  if (typeof audio.base64 !== 'string' || audio.base64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio.base64)) throw new Error('Invalid embedded audio');
  const binary = atob(audio.base64);
  if (binary.length !== audio.bytes) throw new Error('Audio byte count does not match');
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export async function audioFromBlob(blob) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_AUDIO_BYTES) throw new Error('Choose a non-empty audio file no larger than 10 MiB');
  audioType(blob.type);
  const data = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return { mimeType: blob.type, bytes: data.length, sha256: await sha256(data), base64: btoa(binary) };
}

export function audioBlob(audio) {
  return new Blob([audioBytes(audio)], { type: audio.mimeType });
}

export function createStoryStore(gallery) {
  if (gallery?.schema !== 'relaygate/gallery/1' || !Array.isArray(gallery.works) || gallery.works.length > 3000) throw new Error('Load a relaygate/gallery/1 artwork catalog');
  const authorKey = gallery.artist?.pubkey ?? null;
  if (authorKey !== null && !hex.test(authorKey)) throw new Error('Artist public key must be 64 lowercase hex characters');
  const used = new Set();
  const works = gallery.works.map(work => {
    const workId = id(work.id); if (used.has(workId)) throw new Error('Artwork IDs must be unique'); used.add(workId);
    const coordinate = work.coordinate ?? null;
    if (coordinate !== null && (typeof coordinate !== 'string' || !/^(?:[123][0-9]{4}|40000):[a-f0-9]{64}:.{1,256}$/.test(coordinate) || +coordinate.split(':')[0] < 30000 || +coordinate.split(':')[0] >= 40000)) throw new Error('Invalid addressable artwork coordinate');
    if (work.eventId != null && !hex.test(work.eventId)) throw new Error('Invalid exact artwork event ID');
    return { id: workId, title: required(work.title, 'Artwork title', 1000), coordinate, eventId: work.eventId ?? null };
  });
  return { schema: PRIVATE_SCHEMA, artist: { name: required(gallery.artist?.name, 'Artist name', 300), pubkey: authorKey }, works, drafts: {}, revisions: [], active: {}, withdrawals: [] };
}

export function selectWork(store, workId) {
  const work = workFor(store, workId);
  const current = store.revisions.find(r => r.revisionId === store.active[workId]);
  return clone({ work, draft: store.drafts[workId] || { workId, baseRevision: current?.revisionId ?? null, transcript: current?.transcript ?? '', language: current?.language ?? 'en', audio: current?.audio ?? null, source: current?.source ?? 'typed', summary: current?.summary ?? '', translations: current?.translations ?? [], questions: current?.questions ?? [], chapters: current?.chapters ?? [], rights: current?.rights ?? '' } });
}

function draftFields(draft) {
  if (!draft || typeof draft !== 'object') throw new Error('Invalid story draft');
  const source = draft.source ?? 'typed';
  if (!['typed', 'recording', 'uploaded-audio'].includes(source)) throw new Error('Invalid story source');
  if (!Array.isArray(draft.translations ?? []) || (draft.translations?.length ?? 0) > 20 || !Array.isArray(draft.questions ?? []) || (draft.questions?.length ?? 0) > 100 || !Array.isArray(draft.chapters ?? []) || (draft.chapters?.length ?? 0) > 100) throw new Error('Too many translations, questions or chapters');
  const seenLanguages = new Set(), seenQuestions = new Set();
  const translations = (draft.translations || []).map(t => {
    const lang = language(t.language); if (seenLanguages.has(lang.toLowerCase())) throw new Error('Duplicate translation language'); seenLanguages.add(lang.toLowerCase());
    return { language: lang, text: required(t.text, 'Translation') };
  });
  const questions = (draft.questions || []).map(q => {
    const question = required(q.question, 'Question', 500), normalized = normalizeQuestion(question);
    if (seenQuestions.has(normalized)) throw new Error('Duplicate approved question'); seenQuestions.add(normalized);
    return { question, answer: required(q.answer, 'Answer', 5000) };
  });
  let previous = -1;
  const chapters = (draft.chapters || []).map(c => {
    if (!Number.isFinite(c.startSeconds) || c.startSeconds < 0 || c.startSeconds > 3600 || c.startSeconds <= previous) throw new Error('Chapter times must be increasing, between 0 and 3600 seconds');
    previous = c.startSeconds;
    return { startSeconds: c.startSeconds, title: required(c.title, 'Chapter title', 200) };
  });
  const audio = draft.audio == null ? null : { mimeType: draft.audio.mimeType, bytes: draft.audio.bytes, sha256: draft.audio.sha256, base64: draft.audio.base64 };
  if (audio) audioBytes(audio);
  return { transcript: optional(draft.transcript, 'Transcript'), language: language(draft.language || 'en'), source, audio, summary: optional(draft.summary, 'Summary', 5000), translations, questions, chapters, rights: optional(draft.rights, 'Rights statement', 2000) };
}

export function saveDraft(store, workId, changes, { at = now() } = {}) {
  const { draft } = selectWork(store, workId), next = clone(store);
  // The selected work and base revision cannot be changed by transcript input.
  next.drafts[workId] = { workId, baseRevision: draft.baseRevision, ...draftFields({ ...draft, ...changes }), updatedAt: timestamp(at) };
  return bounded(next);
}

export function discardDraft(store, workId) {
  workFor(store, workId); const next = clone(store); delete next.drafts[workId]; return next;
}

export async function approveStory(store, workId, { reviewed = false, publishConsent = false, audioConsent = false, summaryReviewed = false, translationsReviewed = [], at = now() } = {}) {
  const { work, draft } = selectWork(store, workId);
  if (reviewed !== true || publishConsent !== true) throw new Error('Review the story and explicitly approve its public export');
  if (draft.baseRevision !== (store.active[workId] ?? null)) throw new Error('This draft is based on an older revision; reload and review the latest story');
  const fields = draftFields(draft);
  required(fields.transcript, 'Approved transcript'); required(fields.rights, 'Rights and consent statement', 2000);
  if (fields.audio && audioConsent !== true) throw new Error('Approve rights and consent for the attached recording');
  if (fields.summary && summaryReviewed !== true) throw new Error('Review the summary separately before approving it');
  if (!Array.isArray(translationsReviewed) || fields.translations.some(t => !translationsReviewed.includes(t.language))) throw new Error('Review each translation before approving it');
  if (fields.audio && await sha256(audioBytes(fields.audio)) !== fields.audio.sha256) throw new Error('Audio checksum mismatch');
  const payload = { workId, artworkCoordinate: work.coordinate, artworkEventId: work.eventId, author: clone(store.artist), previousRevision: draft.baseRevision, approvedAt: timestamp(at), ...fields, approval: { reviewed: true, publicExport: true, audioConsent: !!fields.audio, summaryReviewed: !!fields.summary, translationLanguages: fields.translations.map(t => t.language) }, identityStatus: 'unsigned-local-approval' };
  const revision = { revisionId: 'story-' + await sha256(bytes(JSON.stringify(payload))), ...payload };
  const next = clone(store);
  next.revisions.push(revision); next.active[workId] = revision.revisionId; delete next.drafts[workId];
  return bounded(next);
}

export function withdrawStory(store, workId, { confirmed = false, at = now() } = {}) {
  workFor(store, workId);
  if (confirmed !== true) throw new Error('Confirm local withdrawal; downloaded public copies cannot be recalled');
  const next = clone(store), revisionId = next.active[workId];
  if (revisionId) next.withdrawals.push({ workId, revisionId, withdrawnAt: timestamp(at), scope: 'local-export-only' });
  delete next.active[workId]; delete next.drafts[workId];
  return next;
}

export function exportApprovedStories(store) {
  checkStore(store);
  const catalog = createStoryStore({ schema: 'relaygate/gallery/1', artist: store.artist, works: store.works });
  return bounded({ schema: PUBLIC_SCHEMA, artist: catalog.artist, identityStatus: 'unsigned-local-approval', stories: catalog.works.flatMap(w => {
    const revision = store.revisions.find(r => r.revisionId === store.active[w.id]);
    if (!revision) return [];
    checkRevisionFields(revision);
    // Display titles/order may change; never relabel the approved source event.
    const work = { ...w, coordinate: revision.artworkCoordinate, eventId: revision.artworkEventId };
    return [{ work, revision: clone(revision) }];
  }) });
}

function only(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error('Unexpected public story field');
}

function checkRevisionFields(revision) {
  const allowed = ['revisionId', 'workId', 'artworkCoordinate', 'artworkEventId', 'author', 'previousRevision', 'approvedAt', 'transcript', 'language', 'source', 'audio', 'summary', 'translations', 'questions', 'chapters', 'rights', 'approval', 'identityStatus'];
  only(revision, allowed);
  only(revision.author, ['name', 'pubkey']); only(revision.approval, ['reviewed', 'publicExport', 'audioConsent', 'summaryReviewed', 'translationLanguages']);
  if (revision.audio) only(revision.audio, ['mimeType', 'bytes', 'sha256', 'base64']);
  for (const value of revision.questions || []) only(value, ['question', 'answer']);
  for (const value of revision.translations || []) only(value, ['language', 'text']);
  for (const value of revision.chapters || []) only(value, ['startSeconds', 'title']);
  if (typeof revision.approval.audioConsent !== 'boolean' || typeof revision.approval.summaryReviewed !== 'boolean' || !Array.isArray(revision.approval.translationLanguages)) throw new Error('Invalid story approval fields');
  revision.approval.translationLanguages.forEach(language);
}

async function validateRevision(revision) {
  if (!revision || typeof revision !== 'object' || typeof revision.revisionId !== 'string' || !/^story-[a-f0-9]{64}$/.test(revision.revisionId)) throw new Error('Invalid story revision');
  const { revisionId, ...payload } = revision;
  if ('story-' + await sha256(bytes(JSON.stringify(payload))) !== revisionId) throw new Error('Story revision checksum mismatch');
  checkRevisionFields(revision);
  id(revision.workId); draftFields(revision); timestamp(revision.approvedAt);
  createStoryStore({ schema: 'relaygate/gallery/1', artist: revision.author, works: [{ id: revision.workId, title: revision.workId, coordinate: revision.artworkCoordinate, eventId: revision.artworkEventId }] });
  if (revision.previousRevision !== null && !/^story-[a-f0-9]{64}$/.test(revision.previousRevision)) throw new Error('Invalid previous revision');
  required(revision.transcript, 'Approved transcript'); required(revision.rights, 'Rights statement', 2000);
  required(revision.author?.name, 'Artist name', 300);
  if (revision.author.pubkey !== null && !hex.test(revision.author.pubkey)) throw new Error('Invalid author public key');
  if (revision.approval?.reviewed !== true || revision.approval?.publicExport !== true || revision.identityStatus !== 'unsigned-local-approval') throw new Error('Story is not an approved local revision');
  if (revision.audio && revision.approval.audioConsent !== true || revision.summary && revision.approval.summaryReviewed !== true || !Array.isArray(revision.approval.translationLanguages) || revision.translations.some(t => !revision.approval.translationLanguages.includes(t.language))) throw new Error('Audio, summary or translation approval is missing');
  if (revision.audio && await sha256(audioBytes(revision.audio)) !== revision.audio.sha256) throw new Error('Audio checksum mismatch');
  // All fields, including nested records, have been allowlisted and validated.
  // Preserve approved values/key order because the exact payload is hashed.
  return clone(revision);
}

export async function parsePublicStories(json) {
  if (typeof json !== 'string' || bytes(json).length > MAX_ARCHIVE_BYTES) throw new Error('Story archive exceeds 64 MiB');
  const bundle = JSON.parse(json);
  if (bundle.schema !== PUBLIC_SCHEMA || !Array.isArray(bundle.stories) || bundle.stories.length > 3000) throw new Error('Unsupported public story archive');
  for (const story of bundle.stories) {
    only(story, ['work', 'revision']);
    only(story.work, ['id', 'title', 'coordinate', 'eventId']);
  }
  const catalog = createStoryStore({ schema: 'relaygate/gallery/1', artist: bundle.artist, works: bundle.stories.map(s => s.work) });
  const stories = [];
  for (const [index, story] of bundle.stories.entries()) {
    const revision = await validateRevision(story.revision), work = catalog.works[index];
    if (work.id !== revision.workId || revision.author.pubkey !== catalog.artist.pubkey || revision.artworkCoordinate !== work.coordinate || revision.artworkEventId !== work.eventId) throw new Error('Story artwork or author does not match its catalog');
    stories.push({ work, revision });
  }
  return { schema: PUBLIC_SCHEMA, artist: catalog.artist, identityStatus: 'unsigned-local-approval', stories };
}

export async function parsePrivateStories(json) {
  if (typeof json !== 'string' || bytes(json).length > MAX_ARCHIVE_BYTES) throw new Error('Story archive exceeds 64 MiB');
  const store = JSON.parse(json); checkStore(store);
  const clean = createStoryStore({ schema: 'relaygate/gallery/1', artist: store.artist, works: store.works });
  if (store.revisions.length > 10000 || !Array.isArray(store.withdrawals) || store.withdrawals.length > 10000) throw new Error('Too much revision history');
  const revisions = new Set();
  for (const revision of store.revisions) {
    workFor(clean, revision.workId); await validateRevision(revision);
    if (revision.author.pubkey !== clean.artist.pubkey) throw new Error('Story history belongs to a different artist');
    if (revisions.has(revision.revisionId) || (revision.previousRevision && !revisions.has(revision.previousRevision))) throw new Error('Invalid revision history');
    if (revision.previousRevision && clean.revisions.find(r => r.revisionId === revision.previousRevision)?.workId !== revision.workId) throw new Error('Revision history belongs to another artwork');
    revisions.add(revision.revisionId); clean.revisions.push(clone(revision));
  }
  for (const [workId, revisionId] of Object.entries(store.active)) {
    workFor(clean, workId);
    if (!clean.revisions.some(r => r.revisionId === revisionId && r.workId === workId)) throw new Error('Active story revision is missing');
    clean.active[workId] = revisionId;
  }
  for (const [workId, draft] of Object.entries(store.drafts)) {
    workFor(clean, workId);
    if (draft.workId !== workId || (draft.baseRevision && !clean.revisions.some(r => r.revisionId === draft.baseRevision && r.workId === workId))) throw new Error('Draft belongs to an unknown revision');
    clean.drafts[workId] = { workId, baseRevision: draft.baseRevision ?? null, ...draftFields(draft), updatedAt: timestamp(draft.updatedAt) };
  }
  clean.withdrawals = store.withdrawals.map(w => {
    workFor(clean, w.workId);
    if (!clean.revisions.some(r => r.revisionId === w.revisionId && r.workId === w.workId)) throw new Error('Withdrawal references an unknown revision');
    return { workId: w.workId, revisionId: w.revisionId, withdrawnAt: timestamp(w.withdrawnAt), scope: 'local-export-only' };
  });
  return clean;
}

const normalizeQuestion = value => value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
export function answerFromApprovedStory(bundle, workId, question) {
  required(question, 'Visitor question', 1000);
  const story = bundle.stories?.find(s => s.work.id === workId);
  const found = story?.revision.questions.find(q => normalizeQuestion(q.question) === normalizeQuestion(question));
  return found ? { answered: true, text: found.answer, source: { workId, revisionId: story.revision.revisionId, section: 'artist-approved-question' } }
    : { answered: false, text: 'The artist has not supplied an answer to that question.', source: story ? { workId, revisionId: story.revision.revisionId, section: 'original-story' } : null };
}

export async function longFormDraft(revision, { at = now() } = {}) {
  await validateRevision(revision);
  if (!revision?.author?.pubkey || !hex.test(revision.author.pubkey)) throw new Error('An artist public key is required for an unsigned Nostr draft');
  if (!revision.approval?.publicExport) throw new Error('Approve this story before preparing an event');
  const tags = [['d', `relaygate-story:${id(revision.workId)}:${language(revision.language)}`], ['title', `Artist story: ${revision.workId}`], ['t', 'relaygate-story'], ['alt', 'Artist-approved artwork story'], ['relaygate-revision', revision.revisionId]];
  if (revision.artworkCoordinate) tags.push(['a', revision.artworkCoordinate]);
  if (revision.artworkEventId) tags.push(['e', revision.artworkEventId]);
  if (revision.summary) tags.push(['summary', revision.summary]);
  // Stories are plain text: escape Markdown syntax and HTML before NIP-23 export.
  const content = revision.transcript.replace(/[\\`*_[\]{}()#+\-.!|~]/g, '\\$&').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return { kind: 30023, pubkey: revision.author.pubkey, created_at: timestamp(at), tags, content };
}
