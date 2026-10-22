/* Original Deque stamps are available in the normal authoring workflow. */
function prepareStampLibrary(state, sources) {
  const next = structuredClone(state);
  if (next.stampLibraryVersion === '2.3') return { project: next, changed: false, added: 0 };
  const names = { semantic:'Deque · Semantic', sensory:'Deque · Sensory', interactive:'Deque · Interactive', understandable:'Deque · Understandable' };
  let added = 0;
  for (const source of sources) {
    if (next.types.some(t => t.id === source.id || t.sourceStampId === source.sourceStampId)) continue;
    const category = source.group.slice(6);
    let group = next.groups.find(g => g.source === 'deque-reference' && g.sourceCategory === category);
    if (!group) {
      let id = source.group, n = 1;
      while (next.groups.some(g => g.id === id)) id = source.group + '-' + n++;
      group = { id, name:names[category] || 'Deque stamps', source:'deque-reference', sourceCategory:category };
      next.groups.push(group);
    }
    next.types.push({ ...structuredClone(source), group:group.id }); added++;
  }
  next.stampLibraryVersion = '2.3';
  return { project:next, changed:true, added };
}

function stampPreviewHtml(tag) {
  const asset = window.dcaaStamps?.resolve(tag);
  const title = (tag.code ? '#' + tag.code + ' ' : '') + tag.label;
  if (asset) return `<span class="stamp-art"><img src="${esc(asset.src)}" width="${asset.width}" height="${asset.height}" alt="" loading="lazy"></span><span class="stamp-caption">${esc(title)}</span>`;
  const color = /^#[a-f\d]{6}$/i.test(tag.color || '') ? tag.color : '#2e5f7a';
  return `<span class="stamp-art"><span class="stamp-vector" style="--stamp-color:${color};--stamp-fg:${tagForeground(color)}"><b>${esc(tag.code ? '#'+tag.code : 'TAG')}</b><span>${esc(tag.label)}</span></span></span><span class="stamp-caption">${esc(groupName(tag.group))} · ${esc(BORDERS[tag.border] || 'Solid')}</span>`;
}

(() => {
  let started = false;
  function ensureLibrary() {
    const prepared = prepareStampLibrary(project, window.dcaaLibraryData.referenceTags);
    if (!prepared.changed) return;
    try {
      const checked = window.dcaaData.validateBundle({ version:2, project:prepared.project, images:bundle().images });
      const before = serialize();
      project.types = checked.project.types; project.groups = checked.project.groups;
      project.stampLibraryVersion = '2.3';
      const migrated = project;
      commit(before);
      // Startup/recovery finish their own save counters after loadBundle resolves.
      setTimeout(() => { if (project === migrated) scheduleSave(); }, 0);
    } catch (error) { window.dcaaData.notice('The stamp library could not be added: ' + error.message); }
  }
  const start = window.dcaaData.start;
  window.dcaaData.start = async function(...args) { const result = await start(...args); started = true; ensureLibrary(); return result; };
  const load = loadBundle;
  loadBundle = async function(...args) { const result = await load(...args); if (started) ensureLibrary(); return result; };

  const actions = document.createElement('div'); actions.className = 'project-actions';
  actions.setAttribute('role','group'); actions.setAttribute('aria-label','Project and annotation tools');
  actions.innerHTML = '<button type="button" id="projectOpenVisible">Open project</button><button type="button" id="projectSaveVisible">Save project</button><button type="button" id="stampGalleryOpen">Stamps</button><button type="button" id="notesVisible" disabled>Add / edit notes</button><span id="armedStamp" class="hint" role="status">Draw a box, then choose a stamp.</span><button type="button" id="clearArmedStamp" hidden>Choose after drawing</button>';
  $('tabs').before(actions);
  $('projectOpenVisible').onclick = () => $('openProject').click();
  $('projectSaveVisible').onclick = () => window.dcaaData.backup();
  $('clearArmedStamp').onclick = () => { const before = serialize(); project.defaultType = null; commit(before); };
  $('notesVisible').onclick = () => {
    const d = doc(), area = d?.areas.find(a => a.id === sel.area || detail?.kind === 'area' && a.id === detail.id);
    if (!area) return;
    if (mode !== 'ann') setMode('ann');
    detail = { kind:'area', id:area.id }; detailKey = null; refresh();
    requestAnimationFrame(() => $('details').querySelector('[data-field="note"]')?.focus());
  };
  const sync = syncButtons;
  syncButtons = function() {
    sync();
    $('notesVisible').disabled = !doc()?.areas.some(a => a.id === sel.area || detail?.kind === 'area' && a.id === detail.id);
    const tag = types().find(t => t.id === project.defaultType);
    $('armedStamp').textContent = tag ? `Ready: ${tag.code ? '#'+tag.code+' ' : ''}${tag.label}. Draw a box to apply.` : 'Draw a box, then choose a stamp.';
    $('clearArmedStamp').hidden = !tag;
  };
  $('ptAnn').textContent = 'Stamps & tags';
  const renderItems = renderAnnItems;
  renderAnnItems = function(...args) {
    renderItems(...args);
    const rows = [...$('annItems').querySelectorAll('[data-dcaa-type]')];
    rows.forEach(row => {
      const tag = types().find(t => t.id === row.dataset.dcaaType); if (!tag) return;
      row.classList.add('stamp-option'); row.querySelector('.swatch')?.remove();
      const text = row.querySelector('.grow');
      if (text) text.innerHTML = stampPreviewHtml(tag);
      row.querySelector('input').setAttribute('aria-label', (tag.code ? '#'+tag.code+' ' : '') + tag.label);
    });
    // Put Deque stamp groups first; ordinary/custom tags remain available below.
    const box = $('annItems'), sections = []; let current;
    [...box.children].forEach(child => {
      if (child.classList.contains('pgroup')) { current = { nodes:[child], stamp:false }; sections.push(current); }
      else if (current) { current.nodes.push(child); if (types().find(t => t.id === child.dataset.dcaaType)?.sourceStampId) current.stamp = true; }
    });
    sections.sort((a,b) => Number(b.stamp)-Number(a.stamp)).forEach(section => section.nodes.forEach(node => box.appendChild(node)));
  };

  const gallery = document.createElement('dialog'); gallery.id = 'stampGallery';
  gallery.setAttribute('aria-labelledby','stampGalleryTitle');
  gallery.innerHTML = '<div class="stamp-gallery-head"><div><h2 id="stampGalleryTitle">Stamp library</h2><p>Choose a stamp, then draw a box on your screen. Edit notes after placing it.</p></div><button type="button" id="stampGalleryClose">Close</button></div><div class="stamp-gallery-filters"><label>Search stamps<input id="stampGallerySearch" type="search" placeholder="Code, name, or WCAG criterion"></label><label>Collection<select id="stampGalleryCollection"><option value="deque">Deque stamps</option><option value="custom">Other / custom tags</option><option value="all">All stamps & tags</option></select></label></div><p id="stampGalleryCount" role="status"></p><div id="stampGalleryItems" class="stamp-gallery-grid"></div><p class="hint">The original Deque artwork is embedded. Edited and custom tags use your chosen color and outline style.</p>';
  document.body.appendChild(gallery);
  function renderGallery() {
    const query = $('stampGallerySearch').value, collection = $('stampGalleryCollection').value;
    const filtered = types().filter(t => (collection === 'all' || collection === 'deque' && t.sourceStampId || collection === 'custom' && !t.sourceStampId) && window.dcaaLibrary.matchesTag(t,query,{ wcagVersion:window.dcaaLibrary.versionFor(), platform:'all' }));
    $('stampGalleryCount').textContent = `${filtered.length} stamps · WCAG ${window.dcaaLibrary.versionFor()}`;
    const list = $('stampGalleryItems'); list.replaceChildren();
    filtered.forEach(tag => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'stamp-gallery-card';
      button.setAttribute('aria-label','Use '+(tag.code ? '#'+tag.code+' ' : '')+tag.label);
      button.innerHTML = stampPreviewHtml(tag);
      button.onclick = () => { const before = serialize(); project.defaultType = tag.id; project.lastType = tag.id; commit(before); gallery.close(); if(doc())setMode('ann'); $('stampGalleryOpen').focus(); };
      list.appendChild(button);
    });
    if (!filtered.length) list.textContent = 'No matching stamps. Try another search or collection.';
  }
  $('stampGalleryOpen').onclick = () => { ensureLibrary(); renderGallery(); gallery.showModal(); $('stampGallerySearch').focus(); };
  $('stampGalleryClose').onclick = () => gallery.close();
  $('stampGallerySearch').oninput = $('stampGalleryCollection').onchange = renderGallery;
  gallery.addEventListener('close', () => $('stampGalleryOpen').focus());
  window.dcaaStampUi = { ensureLibrary, prepareStampLibrary, renderGallery };
})();
