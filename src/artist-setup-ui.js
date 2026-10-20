// Included by the developer build script after artist-setup.js. Artist-facing
// distribution is a single local HTML file, with no imports or server required.
const $ = id => document.getElementById(id);
let draft = newArtistDraft(), history = [], selected = null, verifiedGate = null, busy = false;
const message = (value, error = false) => { $('status').textContent = value; $('status').className = error ? 'error' : ''; };
const on = (id, event, action) => $(id).addEventListener(event, async e => {
  if (busy) return;
  busy = true; document.body.inert = true; document.body.setAttribute('aria-busy', 'true');
  try { await action(e); } catch (error) { message(error.message, true); }
  finally { busy = false; document.body.inert = false; document.body.removeAttribute('aria-busy'); }
});
const snapshot = () => { const checkpoint = saveCheckpoint(draft, history); history = checkpoint.history; draft = checkpoint.draft; };
const download = (name, content, type) => { const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const currentWork = () => draft.works.find(w => w.id === selected);
const formatSize = value => value == null ? '' : String(Math.round(value * 1000000) / 1000000);

function render() {
  $('artist-name').value = draft.artist.name; $('site-url').value = draft.artist.siteUrl || '';
  $('work-list').replaceChildren();
  for (const work of draft.works) {
    const option = document.createElement('option'); option.value = work.id;
    option.textContent = `${work.included ? 'Included' : 'Excluded'} · ${work.reviewed ? 'Reviewed' : 'Review needed'} · ${work.title}`;
    $('work-list').append(option);
  }
  if (!draft.works.some(w => w.id === selected)) selected = draft.works[0]?.id || null;
  $('work-list').value = selected || '';
  $('work-editor').hidden = !selected; $('empty').hidden = !!selected;
  $('work-count').textContent = `${draft.works.length} candidates · ${draft.works.filter(w => w.included).length} included`;
  const work = currentWork();
  if (work) {
    for (const key of ['title', 'medium', 'year', 'alt', 'description', 'story', 'rights']) $(key).value = work[key] || '';
    $('image-url').value = work.image || ''; $('page-url').value = work.page || '';
    $('width').value = formatSize(work.sizeIn?.w); $('height').value = formatSize(work.sizeIn?.h); $('units').value = 'in';
    for (const key of ['included', 'reviewed', 'rightsConfirmed']) $(key).checked = work[key];
    $('provenance').textContent = `Source: ${work.source || 'unspecified'}; original title: ${work.titleSource || 'unspecified'}; size note: ${work.size || 'unknown'}. ID: ${work.id}`;
    const asset = draft.media[work.localImage];
    $('work-image').hidden = !asset;
    if (asset) { $('work-image').src = `data:${asset.mime};base64,${asset.base64}`; $('work-image').alt = work.alt || work.title; } else $('work-image').removeAttribute('src');
  }
  $('gate-url').value = draft.gate?.url || '';
  $('gate-status').textContent = verifiedGate && verifiedGate.url === draft.gate?.url ? 'The connected resolver checked the signed location under TJ’s supplied key. Reachability and reciprocal approval are not checked.' : 'No verified network connection. An ordinary link remains an unverified web gate.';
  $('method').value = draft.installation.method; $('gallery-url').value = draft.installation.galleryUrl || '';
  $('versions').replaceChildren();
  history.forEach((item, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `Earlier version ${item.revision} · ${item.works.length} candidates`; $('versions').append(option); });
  $('restore-version').disabled = !history.length;
  const ready = readiness(draft); $('readiness').textContent = ready.ready ? `${ready.included} reviewed artworks ready to export.` : ready.problems.slice(0, 5).join('\n') + (ready.problems.length > 5 ? `\n…and ${ready.problems.length - 5} more review items.` : '');
}

function saveArtist() {
  const name = $('artist-name').value, siteUrl = setupUrl($('site-url').value.trim());
  if (name !== draft.artist.name || siteUrl !== draft.artist.siteUrl) { snapshot(); draft.artist = { name, siteUrl }; }
  render();
}

function saveWork() {
  const work = currentWork(); if (!work) return;
  const width = $('width').value, height = $('height').value;
  if (!!width !== !!height) throw new Error('Enter both physical dimensions, or leave both blank when unknown.');
  const factor = $('units').value === 'cm' ? 1 / 2.54 : 1;
  const update = { ...work, image: setupUrl($('image-url').value.trim()), page: setupUrl($('page-url').value.trim()), sizeIn: width && height ? { w: Number(width) * factor, h: Number(height) * factor } : null };
  for (const key of ['title', 'medium', 'year', 'alt', 'description', 'story', 'rights']) update[key] = $(key).value;
  for (const key of ['included', 'reviewed', 'rightsConfirmed']) update[key] = $(key).checked;
  if (width && height) { update.size = `${width} × ${height} ${$('units').value} (width × height)`; update.sizeSource = 'artist-reviewed'; }
  // Preserve an imported size note when no parsed dimensions existed. Clearing
  // previously entered dimensions is an explicit change to unknown size.
  else if (work.sizeIn) { update.size = ''; update.sizeSource = ''; }
  // Validate first so an error cannot erase the last good draft.
  const next = normalizeDraft({ ...draft, works: draft.works.map(w => w.id === selected ? update : w) });
  if (JSON.stringify(next.works) !== JSON.stringify(draft.works)) { snapshot(); draft = { ...next, revision: draft.revision }; }
  render(); message('Artwork changes saved in this session. Download a draft to keep them after closing.');
}

function flushEditors() {
  // saveWork renders the controls, so preserve the artist's unsaved fields.
  const name = $('artist-name').value, site = $('site-url').value;
  saveWork(); $('artist-name').value = name; $('site-url').value = site; saveArtist();
}
for (const id of ['title', 'medium', 'year', 'alt', 'description', 'story', 'width', 'height', 'units', 'page-url', 'rights']) {
  $(id).addEventListener('input', () => { $('reviewed').checked = false; });
}
for (const id of ['image-url', 'rights']) {
  $(id).addEventListener('input', () => { $('reviewed').checked = false; $('rightsConfirmed').checked = false; });
}
on('save-artist', 'click', () => { flushEditors(); message('Artist details saved in this session.'); });
on('work-list', 'change', e => { const next = e.target.value; flushEditors(); selected = next; render(); });
on('save-work', 'click', flushEditors);
on('open-draft', 'change', async e => {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > SETUP_LIMITS.draftBytes) throw new Error('Draft is larger than 60 MiB.');
  const next = parseDraft(await file.text()); draft = next; history = []; selected = null; verifiedGate = null; render();
  message('Opened the file. Imported candidates need review; saved network verification must be refreshed. No data was published.'); e.target.value = '';
});
on('add-images', 'change', async e => {
  flushEditors();
  let next = draft;
  for (const file of e.target.files) {
    if (file.size > SETUP_LIMITS.imageBytes) throw new Error('Each image must be no larger than 8 MiB.');
    next = await addManualImage(next, new Uint8Array(await file.arrayBuffer()), file.name);
  }
  snapshot(); draft = { ...next, revision: draft.revision }; selected = next.works.at(-1)?.id; render(); message('Images added locally. Review each candidate and confirm image permission.'); e.target.value = '';
});
on('attach-image', 'change', async e => {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > SETUP_LIMITS.imageBytes) throw new Error('Each image must be no larger than 8 MiB.');
  flushEditors(); const next = await attachImageToWork(draft, selected, new Uint8Array(await file.arrayBuffer()), file.name);
  snapshot(); draft = { ...next, revision: draft.revision }; render(); message('Image attached to the same artwork ID. Review and confirm permission for the replacement image.'); e.target.value = '';
});
on('add-url', 'click', async () => {
  const image = setupUrl($('new-image-url').value.trim(), { optional: false });
  flushEditors();
  const id = `work-${(await digest(enc.encode(image))).slice(0, 24)}`;
  if (draft.works.some(w => w.id === id)) throw new Error('That image address is already present.');
  const next = normalizeDraft({ ...draft, works: [...draft.works, { id, title: 'Untitled candidate', image, source: 'manual-url', titleSource: 'manual', included: true }] });
  snapshot(); draft = { ...next, revision: draft.revision }; selected = id; $('new-image-url').value = ''; render(); message('Image link added. Its image is not bundled unless you add a local file.');
});
on('save-draft', 'click', () => { flushEditors(); download('relaygate-private-draft.json', JSON.stringify(normalizeDraft(draft)), 'application/json'); message('Draft download prepared. It includes excluded candidates and local images; keep it private.'); });
on('restore-version', 'click', () => { draft = restoreCheckpoint(draft, history, Number($('versions').value)); verifiedGate = null; render(); message('Earlier metadata restored. Download a new draft when ready.'); });
on('preview', 'click', () => { flushEditors(); $('preview-frame').srcdoc = previewHtml(draft); $('preview-panel').hidden = false; message('Local 2D preview opened. Remote image addresses may be requested now. Nothing is hosted or signed.'); });
on('close-preview', 'click', () => { $('preview-frame').srcdoc = ''; $('preview-panel').hidden = true; });
on('connect-tj', 'click', async () => {
  flushEditors();
  const gate = await connectToTj(window.RelayGateSetupAdapters?.resolveSignedGallery);
  snapshot(); draft.gate = gate; verifiedGate = gate; render(); message('TJ’s signed destination was checked by the resolver. Test the visit and return path before installing.');
});
on('save-gate', 'click', () => {
  const url = setupUrl($('gate-url').value.trim(), { https: true }); flushEditors(); snapshot(); draft.gate = url ? { url, label: 'Visit another gallery', status: 'unverified' } : null; verifiedGate = null; render(); message(url ? 'Saved an unverified web link. No reciprocal gate was requested.' : 'Gate removed from this draft.');
});
on('make-snippet', 'click', () => {
  const method = $('method').value, galleryUrl = setupUrl($('gallery-url').value.trim(), { optional: method === 'managed', https: true });
  const snippet = method === 'managed' ? 'Managed hosting is not available in this local editor. Agree provider terms and keep your export before arranging hosting.' : installationSnippet(method, galleryUrl);
  snapshot(); draft.installation = { method, galleryUrl }; $('snippet').value = snippet;
  message('Installation text prepared. This does not upload or check a website. Use the checklist below on your actual host.');
});
on('export-gallery', 'click', async () => {
  flushEditors(); const result = await exportArtistGallery(draft);
  download('relaygate-gallery.zip', storedZip(result.files), 'application/zip');
  message(`Gallery ZIP prepared with ${result.config.works.length} reviewed works. ${result.missingMedia.length} images remain remote-only. Keep a private draft separately. No deployment was performed.`);
});
on('import-website', 'click', async () => {
  const siteUrl = setupUrl($('site-url').value.trim(), { optional: false });
  const importer = window.RelayGateSetupAdapters?.importWebsite;
  if (typeof importer !== 'function') throw new Error('Website import is not connected in this local editor. Add image files or open a gallery.json supplied by the importer. Your current edits are unchanged.');
  const imported = await importer({ siteUrl });
  const next = normalizeDraft(imported, { imported: true }); draft = next; history = []; selected = null; verifiedGate = null; render(); message('Website candidates loaded as a new draft. Review them before exporting.');
});
window.addEventListener('beforeunload', event => { if (draft.works.length) { event.preventDefault(); event.returnValue = ''; } });
render();
