import { createStoryStore, selectWork, saveDraft, discardDraft, approveStory, withdrawStory, exportApprovedStories, parsePrivateStories, parsePublicStories, audioFromBlob, audioBlob, answerFromApprovedStory, MAX_ARCHIVE_BYTES } from './narration.js';
import { createAudioRecorder } from './narration-recorder.js';

// IndexedDB holds private drafts on this origin. It is not an online backup.
export function browserDraftStorage(database = globalThis.indexedDB) {
  if (!database) throw new Error('Local draft storage is unavailable; enable browser storage or use a private backup');
  const opened = new Promise((resolve, reject) => {
    const request = database.open('relaygate-artist-stories-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local draft storage is blocked by another page; close older gallery tabs and retry'));
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = async (mode, key, value) => {
    const db = await opened;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode), table = tx.objectStore('drafts');
      const req = mode === 'readonly' ? table.get(key) : table.put(value, key);
      tx.oncomplete = () => resolve(req.result ?? null);
      tx.onerror = () => reject(tx.error || req.error); tx.onabort = () => reject(tx.error || new Error('Draft save aborted'));
    });
  };
  return { load: key => transaction('readonly', key), save: (key, value) => transaction('readwrite', key, value), close: async () => (await opened).close() };
}

function element(doc, tag, text, attributes = {}) {
  const el = doc.createElement(tag); if (text != null) el.textContent = text;
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
}
function download(doc, name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = element(doc, 'a', 'Download', { href: url, download: name }); doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function label(doc, parent, text, control) {
  const wrapper = element(doc, 'label', text); wrapper.append(control); parent.append(wrapper); return control;
}

export async function mountTeachingPanel(container, { gallery, storage, storageKey, onSelectWork = () => {}, recorderOptions = {} } = {}) {
  const doc = container.ownerDocument;
  if (!storage) {
    try { storage = browserDraftStorage(); }
    catch (error) { storage = { load: async () => { throw error; }, save: async () => { throw error; } }; }
  }
  let store = createStoryStore(gallery), selected = store.works[0]?.id, audioUrl, pending = Promise.resolve(), disposed = false;
  if (!selected) throw new Error('Add an artwork before teaching the guide');
  const key = storageKey || `stories:${gallery.artist.pubkey || gallery.artist.siteUrl || gallery.artist.name}`;
  container.replaceChildren(); container.classList.add('relaygate-narration');
  const title = element(doc, 'h2', 'Teach my guide'), status = element(doc, 'p', 'Local draft. Nothing is published.', { role: 'status', 'aria-live': 'polite' });
  container.append(title, element(doc, 'p', 'Choose the painting, record or type its story, then review and approve it. Private drafts stay in this browser. Public exports contain only approved stories.'), status);
  const picker = label(doc, container, 'Painting ', element(doc, 'select'));
  for (const work of store.works) picker.append(element(doc, 'option', `${work.title} (${work.id})`, { value: work.id }));
  const selectedLabel = element(doc, 'h3'); container.append(selectedLabel);
  const language = label(doc, container, 'Original language ', element(doc, 'input', null, { type: 'text', value: 'en', maxlength: '35' }));
  const recordConsent = label(doc, container, ' I consent to recording my voice. ', element(doc, 'input', null, { type: 'checkbox' }));
  const buttons = element(doc, 'div'), start = element(doc, 'button', 'Start recording', { type: 'button' }), pause = element(doc, 'button', 'Pause recording', { type: 'button' }), stop = element(doc, 'button', 'Stop recording', { type: 'button' });
  buttons.append(start, pause, stop); container.append(buttons);
  const upload = label(doc, container, 'Or upload audio (up to 10 MiB) ', element(doc, 'input', null, { type: 'file', accept: 'audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav' }));
  const playback = element(doc, 'audio', null, { controls: '', preload: 'none' }); container.append(playback);
  const transcript = label(doc, container, 'Transcript or typed story ', element(doc, 'textarea', null, { rows: '8', maxlength: '30000' }));
  container.append(element(doc, 'p', 'No transcription service is called. Type or paste a transcript and correct it before approval.'));
  const summary = label(doc, container, 'Optional guide summary (labelled as a summary to visitors) ', element(doc, 'textarea', null, { rows: '3', maxlength: '5000' }));
  const rights = label(doc, container, 'Rights and permission statement ', element(doc, 'textarea', null, { rows: '2', maxlength: '2000', placeholder: 'For example: I wrote this story and have permission to share the recording.' }));
  const review = label(doc, container, ' I reviewed the transcript and approve this story for public export. ', element(doc, 'input', null, { type: 'checkbox' }));
  const audioConsent = label(doc, container, ' I have permission to publish the attached recording. ', element(doc, 'input', null, { type: 'checkbox' }));
  const summaryReview = label(doc, container, ' I separately reviewed the optional summary. ', element(doc, 'input', null, { type: 'checkbox' }));
  const approve = element(doc, 'button', 'Approve this revision', { type: 'button' }), discard = element(doc, 'button', 'Discard draft changes', { type: 'button' }), exportPublic = element(doc, 'button', 'Export approved stories', { type: 'button' }), exportPrivate = element(doc, 'button', 'Save private backup', { type: 'button' });
  container.append(approve, discard, exportPublic, exportPrivate);
  const restore = label(doc, container, 'Restore a private backup ', element(doc, 'input', null, { type: 'file', accept: '.json,application/json' }));
  const withdrawalConsent = label(doc, container, ' Remove this story from future exports. Previously downloaded copies cannot be recalled. ', element(doc, 'input', null, { type: 'checkbox' }));
  const withdraw = element(doc, 'button', 'Withdraw this story locally', { type: 'button' }); container.append(withdraw);
  const busyControls = [picker, upload, approve, discard, restore, withdraw];
  const recorder = createAudioRecorder({ ...recorderOptions, onState(value) {
    const active = ['requesting', 'recording', 'paused', 'stopping', 'cancelling'].includes(value);
    for (const control of busyControls) control.disabled = active;
    start.disabled = active; pause.disabled = !['recording', 'paused'].includes(value); stop.disabled = !['recording', 'paused'].includes(value);
    pause.textContent = value === 'paused' ? 'Resume recording' : 'Pause recording';
    status.textContent = `Recording: ${value}. Selected painting: ${store.works.find(w => w.id === selected)?.title}.`;
  } });
  pause.disabled = true; stop.disabled = true;
  const report = error => { if (!disposed) status.textContent = `Could not complete that step: ${error.message}. Your draft is still available in memory; use Save private backup if storage is unavailable.`; };
  const run = action => { pending = pending.then(async () => { if (!disposed) await action(); }).catch(report); return pending; };
  const persist = () => storage.save(key, JSON.stringify(store));
  const showAudio = audio => { playback.pause(); if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = audio ? URL.createObjectURL(audioBlob(audio)) : null; if (audioUrl) playback.src = audioUrl; else playback.removeAttribute('src'); playback.load(); };
  const render = () => {
    const { work, draft } = selectWork(store, selected);
    picker.value = selected; selectedLabel.textContent = `Selected painting: ${work.title}`;
    language.value = draft.language; transcript.value = draft.transcript; summary.value = draft.summary; rights.value = draft.rights;
    review.checked = audioConsent.checked = summaryReview.checked = withdrawalConsent.checked = false;
    showAudio(draft.audio); onSelectWork(work.id);
    status.textContent = store.active[selected] ? 'An approved revision is available. Changes remain private until approved again.' : 'Private draft. No approved story is available to visitors yet.';
  };
  for (const control of [language, transcript, summary, rights]) control.addEventListener('input', () => {
    const workId = selected, changes = { transcript: transcript.value, language: language.value, summary: summary.value, rights: rights.value };
    review.checked = summaryReview.checked = false;
    run(async () => { store = saveDraft(store, workId, changes); await persist(); });
  });
  picker.addEventListener('change', () => run(async () => { selected = picker.value; render(); }));
  start.addEventListener('click', () => { const workId = selected; run(async () => {
    if (selected !== workId) throw new Error('The selected painting changed; confirm its title before recording');
    const { finished } = await recorder.start({ consent: recordConsent.checked });
    finished.then(blob => run(async () => { const audio = await audioFromBlob(blob); store = saveDraft(store, workId, { audio, source: 'recording' }); await persist(); if (selected === workId) render(); })).catch(report);
  }); });
  pause.addEventListener('click', () => { try { recorder.state === 'paused' ? recorder.resume() : recorder.pause(); } catch (error) { report(error); } });
  stop.addEventListener('click', () => { try { recorder.stop().catch(report); } catch (error) { report(error); } });
  upload.addEventListener('change', () => { const file = upload.files[0], workId = selected; if (file) run(async () => { const audio = await audioFromBlob(file); store = saveDraft(store, workId, { audio, source: 'uploaded-audio' }); await persist(); if (selected === workId) render(); }); });
  approve.addEventListener('click', () => { const workId = selected, consent = { reviewed: review.checked, publishConsent: review.checked, audioConsent: audioConsent.checked, summaryReviewed: summaryReview.checked }; run(async () => {
    if (selected !== workId) throw new Error('The selected painting changed; review its story before approval');
    const { draft } = selectWork(store, selected);
    if (draft.translations.length) throw new Error('This draft contains translations; review them through the integration API before approving');
    store = await approveStory(store, selected, consent);
    await persist(); render(); status.textContent = 'Approved locally. Export approved stories to share; no relay event or website was published.';
  }); });
  discard.addEventListener('click', () => { const workId = selected; run(async () => { if (selected !== workId) throw new Error('The selected painting changed; confirm which draft to discard'); store = discardDraft(store, workId); await persist(); render(); }); });
  exportPublic.addEventListener('click', () => run(() => download(doc, 'approved-stories.json', exportApprovedStories(store))));
  exportPrivate.addEventListener('click', () => run(() => download(doc, 'PRIVATE-story-backup.json', store)));
  restore.addEventListener('change', () => { const file = restore.files[0]; if (file) run(async () => {
    if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Backup exceeds 64 MiB');
    const next = await parsePrivateStories(await file.text());
    if (next.artist.name !== store.artist.name || next.artist.pubkey !== store.artist.pubkey || next.works.length !== store.works.length || next.works.some(w => !store.works.some(current => current.id === w.id))) throw new Error('This backup belongs to a different artist or artwork set');
    next.works = store.works; store = next; await persist(); render();
  }); });
  withdraw.addEventListener('click', () => { const workId = selected, confirmed = withdrawalConsent.checked; run(async () => { if (selected !== workId) throw new Error('The selected painting changed; confirm which story to withdraw'); store = withdrawStory(store, workId, { confirmed }); await persist(); render(); }); });
  const initializingControls = [...container.querySelectorAll('button,input,textarea,select')];
  for (const control of initializingControls) control.disabled = true;
  try {
    const saved = await storage.load(key);
    if (saved) {
      const prior = await parsePrivateStories(saved);
      if (prior.artist.name !== store.artist.name || prior.artist.pubkey !== store.artist.pubkey || prior.works.length !== store.works.length || prior.works.some(w => !store.works.some(current => current.id === w.id))) throw new Error('Saved draft belongs to a different artwork set; use a distinct storageKey or restore a matching backup');
      prior.works = store.works; store = prior;
    }
    render();
  } catch (error) { render(); report(error); }
  for (const control of initializingControls) control.disabled = false;
  pause.disabled = stop.disabled = true;
  return { select: workId => run(() => { if (['requesting', 'recording', 'paused', 'stopping', 'cancelling'].includes(recorder.state)) throw new Error('Stop recording before selecting another painting'); selectWork(store, workId); selected = workId; render(); }), snapshot: () => structuredClone(store), async dispose() { disposed = true; recorder.cancel(); if (audioUrl) URL.revokeObjectURL(audioUrl); playback.pause(); await storage.close?.(); container.replaceChildren(); } };
}

export async function mountVisitorStory(container, json, workId) {
  const bundle = await parsePublicStories(json), doc = container.ownerDocument;
  const story = bundle.stories.find(s => s.work.id === workId);
  container.replaceChildren(); container.classList.add('relaygate-narration');
  if (!story) { container.append(element(doc, 'p', 'The artist has not supplied a story for this painting.')); return { dispose() {} }; }
  const revision = story.revision;
  container.append(element(doc, 'h2', `The story of ${story.work.title}`), element(doc, 'p', `Artist-approved local record · ${revision.revisionId}. Artist identity is not cryptographically verified.`));
  let audioUrl;
  if (revision.audio) {
    container.append(element(doc, 'h3', 'Hear the artist'));
    const audio = element(doc, 'audio', null, { controls: '', preload: 'none' });
    audioUrl = URL.createObjectURL(audioBlob(revision.audio)); audio.src = audioUrl; container.append(audio);
  }
  container.append(element(doc, 'h3', 'Read the story'), element(doc, 'p', revision.transcript, { lang: revision.language, class: 'story-transcript' }));
  if (revision.summary) container.append(element(doc, 'h3', 'Guide summary (approved by the artist)'), element(doc, 'p', revision.summary));
  for (const translation of revision.translations) container.append(element(doc, 'h3', `Approved translation: ${translation.language}`), element(doc, 'p', translation.text, { lang: translation.language }));
  container.append(element(doc, 'p', `Rights: ${revision.rights}`));
  const question = label(doc, container, 'Ask about this painting ', element(doc, 'input', null, { type: 'text', maxlength: '1000' }));
  const ask = element(doc, 'button', 'Find an artist-approved answer', { type: 'button' }), answer = element(doc, 'p', '', { role: 'status', 'aria-live': 'polite' }); container.append(ask, answer);
  ask.addEventListener('click', () => {
    try { const result = answerFromApprovedStory(bundle, workId, question.value); answer.textContent = result.text + (result.source ? ` Source: ${result.source.revisionId}.` : ''); }
    catch (error) { answer.textContent = error.message; }
  });
  container.append(element(doc, 'p', 'Questions are checked against approved answers on this device. They are not saved or sent to a server.'));
  return { dispose() { container.querySelector('audio')?.pause(); if (audioUrl) URL.revokeObjectURL(audioUrl); container.replaceChildren(); } };
}
