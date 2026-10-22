/* Load after library-data.js and the original/editor definitions, before refresh()/loadSaved(). */
(() => {
  'use strict';
  const data = window.dcaaLibraryData;
  if (!data || !Array.isArray(data.rules)) throw new Error('DCAA library data is missing.');
  const platforms = ['Web', 'Mobile Web', 'Mobile'];
  const rules = data.rules.map(rule => ({ ...rule }));
  const escape = value => esc(value == null ? '' : value);
  const parseIds = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[;,\n]+/)).map(id => String(id).trim().replace(/^#/, '')).filter(Boolean))];
  const preferences = () => ({ wcagVersion: '2.2', platform: 'all', ...(project.libraryPreferences || {}) });
  const versionFor = area => area?.wcagVersion === '2.1' || area?.wcagVersion === '2.2' ? area.wcagVersion : preferences().wcagVersion === '2.1' ? '2.1' : '2.2';
  const platformFor = area => platforms.includes(area?.platform) ? area.platform : platforms.includes(preferences().platform) ? preferences().platform : 'Web';
  const normalizePlatforms = tag => Array.isArray(tag?.platforms) && tag.platforms.some(value => platforms.includes(value)) ? [...new Set(tag.platforms.filter(value => platforms.includes(value)))] : ['Web', 'Mobile Web'];
  const rulesForVersion = version => rules.filter(rule => version === '2.1' ? rule.introduced !== '2.2' : !rule.removedIn22).map(rule => {
    if (version !== '2.1') return { ...rule };
    const fragment = rule.id === '2.5.5' ? 'target-size' : rule.fragment;
    return { ...rule, title: rule.id === '2.5.5' ? 'Target Size' : rule.title, url: `https://www.w3.org/TR/WCAG21/#${fragment}`, understandingUrl: `https://www.w3.org/WAI/WCAG21/Understanding/${fragment}.html` };
  });
  const ruleFor = (id, version = versionFor()) => rulesForVersion(version).find(rule => rule.id === String(id).trim().replace(/^#/, ''));
  const availability = (id, version) => {
    const known = rules.find(rule => rule.id === id);
    if (!known) return 'Unrecognized criterion';
    if (version === '2.2' && known.removedIn22) return 'Removed in WCAG 2.2';
    if (version === '2.1' && known.introduced === '2.2') return 'Introduced in WCAG 2.2';
    return '';
  };
  const ruleLinks = (value, version = versionFor()) => parseIds(value).map(id => {
    const rule = ruleFor(id, version);
    return rule ? `<span class="dcaa-rule-pair"><a href="${rule.url}" target="_blank" rel="noopener noreferrer" title="WCAG ${version}: ${escape(rule.title)} (Level ${rule.level}); opens a new tab">${escape(rule.id)} ${escape(rule.title)} <span class="dcaa-level">${rule.level}</span></a><a class="dcaa-understanding" href="${rule.understandingUrl}" target="_blank" rel="noopener noreferrer" aria-label="Understanding ${escape(rule.id)} ${escape(rule.title)}; opens a new tab">Understanding</a></span>` : `<span class="dcaa-rule-unavailable">${escape(id)} · ${escape(availability(id, version))}</span>`;
  }).join('');
  const matchesTag = (tag, query = '', prefs = preferences()) => {
    if (prefs.platform !== 'all' && !normalizePlatforms(tag).includes(prefs.platform)) return false;
    const ids = parseIds(tag.wcag);
    // Unmapped/unknown legacy references stay visible for human review. A tag is unavailable
    // only when every recorded criterion is known and absent from the chosen version.
    if (ids.length && ids.every(id => rules.some(rule => rule.id === id) && !ruleFor(id, prefs.wcagVersion))) return false;
    const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
    const text = `${tag.label} ${tag.code || ''} ${groupName(tag.group)} ${tag.description || ''} ${tag.wcag || ''} ${normalizePlatforms(tag).join(' ')}`.toLowerCase();
    return words.every(word => text.includes(word));
  };
  let libraryQuery = '';
  let directoryTarget = null;
  let directoryReturnFocus = null;

  function ensureAnnotationContext(area) {
    if (!['2.1', '2.2'].includes(area.wcagVersion)) area.wcagVersion = versionFor();
    if (!platforms.includes(area.platform)) area.platform = platformFor();
  }
  function freezeMissingContexts() {
    [...project.pages, ...project.components].forEach(item => item.areas.forEach(ensureAnnotationContext));
  }
  // Pointer creation, default-tag creation, and tag changes all use commit().
  // Fill legacy/missing context once without overwriting deliberate choices.
  const originalContextCommit = commit;
  commit = function (before) { freezeMissingContexts(); originalContextCommit(before); };

  function status(message) {
    let live = $('dcaa-library-status');
    if (!live) { live = document.createElement('p'); live.id = 'dcaa-library-status'; live.className = 'sr'; live.setAttribute('role', 'status'); document.body.appendChild(live); }
    live.textContent = message;
  }
  function updatePreference(key, value) {
    // Preserve the effective context of older annotations before changing a view filter.
    freezeMissingContexts();
    project.libraryPreferences = { ...preferences(), [key]: value };
    scheduleSave();
    document.querySelectorAll(`[data-dcaa-filter="${key}"]`).forEach(control => { control.value = value; });
    filterSettingsRows();
    if (pickerArea && $('annItems')) renderAnnItems(pickerArea, $('pickerList').querySelector('.psearch')?.value || '');
    if (detail?.kind === 'area') { detailKey = null; renderDetail(); }
  }
  function filterControls(context) {
    const wrap = document.createElement('div'); wrap.className = 'dcaa-library-filters';
    const prefs = preferences();
    wrap.innerHTML = `<label>WCAG version<select data-dcaa-filter="wcagVersion" aria-label="${context} WCAG version"><option value="2.1">WCAG 2.1</option><option value="2.2">WCAG 2.2</option></select></label><label>Platform<select data-dcaa-filter="platform" aria-label="${context} platform"><option value="all">All platforms</option>${platforms.map(value => `<option value="${value}">${value === 'Mobile' ? 'Mobile (native)' : value}</option>`).join('')}</select></label>`;
    wrap.querySelectorAll('select').forEach(control => { control.value = prefs[control.dataset.dcaaFilter]; control.onchange = () => updatePreference(control.dataset.dcaaFilter, control.value); });
    return wrap;
  }

  const originalSetPickerTab = setPickerTab;
  setPickerTab = function (tab) {
    originalSetPickerTab(tab);
    if (tab !== 'ann') return;
    const list = $('pickerList'); list.prepend(filterControls('Annotation picker'));
    const note = document.createElement('p'); note.className = 'hint dcaa-filter-help'; note.textContent = 'Existing selections remain available when filters change.'; list.appendChild(note);
  };
  renderAnnItems = function (area, query = '') {
    const box = $('annItems'); if (!box) return;
    box.innerHTML = '';
    const prefs = preferences(); let visible = 0;
    groups().forEach(group => {
      const matching = types().filter(tag => tag.group === group.id && (matchesTag(tag, query, prefs) || (pickerEditing && area && hasType(area, tag.id))));
      if (!matching.length) return;
      const heading = document.createElement('p'); heading.className = 'pgroup'; heading.textContent = `${group.name} (${matching.length})`; box.appendChild(heading);
      matching.forEach(tag => {
        visible++;
        const on = !!(pickerEditing && area && hasType(area, tag.id)), only = on && typesOf(area).length === 1;
        const row = document.createElement('label'); row.className = 'opt'; row.dataset.dcaaType = tag.id;
        const color = /^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : '#2e5f7a';
        const outside = !matchesTag(tag, query, prefs);
        row.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''} ${only ? 'aria-disabled="true"' : ''} aria-describedby="pickerInfo"><span class="swatch" style="--c:${color}" data-border="${escape(tag.border)}" aria-hidden="true"></span><span class="grow">${escape(tag.code ? `#${tag.code} ${tag.label}` : tag.label)}${outside ? '<small class="hint dcaa-filter-retained">Selected · outside current filter</small>' : ''}</span>`;
        if (only) row.title = 'An annotation needs at least one type';
        const checkbox = row.querySelector('input');
        row.onmouseenter = checkbox.onfocus = () => showInfo(tag, row);
        checkbox.onchange = () => { toggleType(area, tag.id, checkbox); [...document.querySelectorAll('#annItems [data-dcaa-type]')].find(item => item.dataset.dcaaType === tag.id)?.querySelector('input')?.focus(); };
        box.appendChild(row);
      });
    });
    if (!visible) box.innerHTML = `<p class="hint">No matching annotations.${prefs.platform === 'Mobile' ? ' Create a custom tag in Settings and select Mobile (native).' : ' Try another search or platform.'}</p>`;
    const first = box.querySelector('input:checked')?.closest('.opt') || box.querySelector('.opt');
    first ? requestAnimationFrame(() => first.isConnected && first.dispatchEvent(new Event('mouseenter'))) : hideInfo();
  };

  const originalShowInfo = showInfo;
  showInfo = function (tag, anchor) {
    originalShowInfo(tag, anchor);
    const info = $('pickerInfo');
    if (info.style.display !== 'block') return;
    let wcag = info.querySelector('.infoWcag');
    if (!wcag && parseIds(tag.wcag).length) { wcag = document.createElement('div'); wcag.className = 'infoWcag'; info.appendChild(wcag); }
    if (wcag) wcag.innerHTML = `<span class="hint">WCAG ${versionFor(pickerArea)}</span><div class="dcaa-rule-links">${ruleLinks(tag.wcag, versionFor(pickerArea))}</div>`;
    const platform = document.createElement('p'); platform.className = 'hint'; platform.textContent = normalizePlatforms(tag).map(value => value === 'Mobile' ? 'Mobile (native)' : value).join(' · '); info.appendChild(platform);
    if (tag.sourceStampId) { const source = document.createElement('p'); source.className = 'hint'; source.textContent = `Deque reference #${tag.code}, v${tag.sourceVersion}. Legacy criterion mappings require applicability review.`; info.appendChild(source); }
    info.style.top = Math.max(8, Math.min(parseFloat(info.style.top) || 8, innerHeight - info.offsetHeight - 8)) + 'px';
  };
  const originalRenderDetail = renderDetail;
  renderDetail = function () {
    originalRenderDetail();
    if (mode !== 'ann' || detail?.kind !== 'area' || $('details').hidden) return;
    const area = doc()?.areas.find(item => item.id === detail.id); if (!area) return;
    $('details').querySelectorAll('.dType[data-t]').forEach(section => {
      const tag = typeById(section.dataset.t), chips = section.querySelector('.chips');
      if (chips?.parentElement) chips.parentElement.innerHTML = `<span class="hint">WCAG ${versionFor(area)}</span><div class="chips dcaa-rule-links">${ruleLinks(tag.wcag, versionFor(area))}</div>`;
    });
    const panel = $('details');
    let controls = panel.querySelector('.dcaa-annotation-context');
    if (controls && controls.dataset.area !== area.id) { controls.remove(); controls = null; }
    if (!controls) {
      controls = document.createElement('fieldset'); controls.className = 'dcaa-annotation-context dcaa-tag-platforms'; controls.dataset.area = area.id;
      controls.innerHTML = '<legend>Annotation context</legend><div class="dcaa-library-filters"><label>WCAG version<select data-annotation-context="wcagVersion"><option value="2.1">WCAG 2.1</option><option value="2.2">WCAG 2.2</option></select></label><label>Platform<select data-annotation-context="platform"><option value="Web">Web</option><option value="Mobile Web">Mobile Web</option><option value="Mobile">Mobile (native)</option></select></label></div><p class="hint">Saved with this annotation. Library filters do not change these choices.</p>';
      panel.insertBefore(controls, panel.querySelector('.eu-review'));
      controls.querySelectorAll('select').forEach(control => { control.onchange = () => {
        const key = control.dataset.annotationContext, value = control.value;
        if (!(key === 'wcagVersion' ? ['2.1', '2.2'] : platforms).includes(value)) return;
        const before = serialize(); ensureAnnotationContext(area); area[key] = value;
        detailKey = null; commit(before);
        panel.querySelector(`[data-annotation-context="${key}"]`)?.focus();
        status('Annotation context saved.');
      }; });
    }
    controls.querySelector('[data-annotation-context="wcagVersion"]').value = versionFor(area);
    controls.querySelector('[data-annotation-context="platform"]').value = platformFor(area);
  };

  function ensureSettingsTools() {
    const section = $('settings').querySelector('.setSec');
    if (!section || $('dcaa-library-tools')) return;
    const help = section.querySelector('.secHead .hint');
    if (help) help.textContent = 'Create and customize reusable annotation tags. Choose platforms, colors, borders and properties. WCAG links are references to review in context; adding a tag does not establish conformance.';
    const tools = document.createElement('div'); tools.id = 'dcaa-library-tools';
    const filters = filterControls('Tag library');
    const search = document.createElement('label'); search.innerHTML = 'Search this group<input type="search" placeholder="Name, code, description or criterion" aria-label="Search tag library">';
    search.querySelector('input').value = libraryQuery;
    search.querySelector('input').oninput = event => { libraryQuery = event.target.value; filterSettingsRows(); };
    filters.appendChild(search); tools.appendChild(filters);
    tools.insertAdjacentHTML('beforeend', '<div class="dcaa-library-actions"><button type="button" data-library-action="rules">WCAG rule directory</button><button type="button" data-library-action="references">Add Deque reference tags</button><button type="button" data-library-action="new22">Add WCAG 2.2 tags</button></div><p class="hint">Web tags also support Mobile Web. Native Mobile has no preset assumptions; assign it to tags you review for native use. Unknown and unmapped criterion references remain visible.</p><p id="dcaa-library-count" class="hint" role="status"></p>');
    section.insertBefore(tools, section.querySelector('.libLayout'));
    tools.querySelector('[data-library-action="rules"]').onclick = () => openDirectory();
    tools.querySelector('[data-library-action="references"]').onclick = addReferenceTags;
    tools.querySelector('[data-library-action="new22"]').onclick = add22Tags;
  }
  function refreshTagCriteria(row, tag) {
    const preview = row.querySelector('.dcaa-tag-criteria');
    if (!preview) return;
    preview.innerHTML = parseIds(tag.wcag).length ? ruleLinks(tag.wcag, versionFor()) : '<span class="hint">No WCAG criteria assigned.</span>';
  }
  function enhanceSettingsRows() {
    $('libGroups').querySelectorAll('.libItems > li[data-type]').forEach(row => {
      const tag = types().find(item => item.id === row.dataset.type); if (!tag || row.querySelector('.dcaa-tag-platforms')) return;
      const fieldset = document.createElement('fieldset'); fieldset.className = 'dcaa-tag-platforms';
      fieldset.innerHTML = `<legend>Platforms for ${escape(tag.label)}</legend>${platforms.map(value => `<label><input type="checkbox" value="${value}" ${normalizePlatforms(tag).includes(value) ? 'checked' : ''}> ${value === 'Mobile' ? 'Mobile (native)' : value}</label>`).join('')}<span class="hint" data-platform-message role="status"></span>`;
      fieldset.querySelectorAll('input').forEach(control => { control.onchange = () => {
        const values = [...fieldset.querySelectorAll('input:checked')].map(input => input.value);
        if (!values.length) { control.checked = true; fieldset.querySelector('[data-platform-message]').textContent = 'Keep at least one platform selected.'; return; }
        fieldset.querySelector('[data-platform-message]').textContent = '';
        const before = serialize(); tag.platforms = values; commit(before); filterSettingsRows();
      }; });
      row.querySelector('.libRow2').after(fieldset);
      const block = document.createElement('div'); block.className = 'dcaa-tag-wcag';
      block.innerHTML = '<button type="button" class="small">Choose WCAG criteria</button><div class="dcaa-tag-criteria dcaa-rule-links"></div>';
      block.querySelector('button').onclick = () => openDirectory(tag);
      fieldset.after(block);
      const text = row.querySelector('.wcag textarea');
      text.addEventListener('input', () => refreshTagCriteria(row, tag));
      text.addEventListener('change', () => filterSettingsRows());
      refreshTagCriteria(row, tag);
      if (tag.sourceStampId) {
        const source = document.createElement('p'); source.className = 'hint dcaa-source-note'; source.textContent = `Source: Deque stamp #${tag.code}, collection v${tag.sourceVersion}. Original criterion mappings are retained for review.`; block.appendChild(source);
      }
    });
  }
  function filterSettingsRows() {
    const rows = [...$('libGroups').querySelectorAll('.libItems > li[data-type]')]; let count = 0;
    rows.forEach(row => {
      const tag = types().find(item => item.id === row.dataset.type);
      row.hidden = !tag || !matchesTag(tag, libraryQuery);
      if (!row.hidden) count++;
      if (tag) refreshTagCriteria(row, tag);
    });
    const output = $('dcaa-library-count');
    if (output) output.textContent = `${count} of ${rows.length} tags in this group · ${types().length} total tags. WCAG ${versionFor()}.`;
  }
  const originalRenderSettings = renderSettings;
  renderSettings = function () {
    originalRenderSettings(); ensureSettingsTools();
    document.querySelectorAll('#dcaa-library-tools [data-dcaa-filter]').forEach(control => { control.value = preferences()[control.dataset.dcaaFilter]; });
    enhanceSettingsRows(); filterSettingsRows();
    // The original Add action defaults to web tags. A native-only filter must not
    // hide the new custom tag before its platform choices can be edited.
    const add = $('libGroups').querySelector('[data-act="add"]');
    if (add) {
      const originalAdd = add.onclick;
      add.onclick = event => {
        const known = new Set(types().map(tag => tag.id));
        originalAdd.call(add, event);
        const created = types().find(tag => !known.has(tag.id));
        if (created && preferences().platform === 'Mobile') {
          created.platforms = ['Mobile']; scheduleSave(); renderSettings();
          [...$('libGroups').querySelectorAll('[data-type]')].find(row => row.dataset.type === created.id)?.querySelector('.tName')?.select();
        }
      };
    }
  };

  function addReferenceTags() {
    const before = serialize();
    const groupNames = { semantic: 'Deque · Semantic', sensory: 'Deque · Sensory', interactive: 'Deque · Interactive', understandable: 'Deque · Understandable' };
    let count = 0;
    data.referenceTags.forEach(source => {
      if (types().some(tag => tag.id === source.id || tag.sourceStampId === source.sourceStampId)) return;
      const category = source.group.slice('deque-'.length);
      // Avoid writing into a custom group that happens to use the import group ID.
      let group = groups().find(item => item.sourceCategory === category && item.source === 'deque-reference');
      if (!group) {
        const id = groups().some(item => item.id === source.group) ? uid('g') : source.group;
        group = { id, name: groupNames[category], source: 'deque-reference', sourceCategory: category }; project.groups.push(group);
      }
      project.types.push({ ...structuredClone(source), group: group.id }); count++;
    });
    commit(before); renderSettings();
    status(count ? `Added ${count} Deque reference tags. Your existing tags were preserved.` : 'All Deque reference tags are already in this project.');
    const countNode = $('dcaa-library-count'); if (countNode) countNode.textContent = `${count} Deque reference tags added. Existing tags are preserved. Choose a Deque group to review them.`;
  }
  function add22Tags() {
    const before = serialize(); let count = 0;
    const selected = rules.filter(rule => rule.introduced === '2.2');
    let group = groups().find(item => item.source === 'wcag22');
    if (!group) { group = { id: uid('g'), name: 'WCAG 2.2 additions', source: 'wcag22' }; project.groups.push(group); }
    selected.forEach(rule => {
      const id = `wcag22-${rule.id.replace(/\./g, '-')}`;
      if (types().some(tag => tag.id === id || tag.sourceRuleId === rule.id)) return;
      project.types.push({ id, group: group.id, label: rule.title, color: '#2e5f7a', border: 'solid', wcag: rule.id, description: `Review this element against WCAG 2.2 ${rule.id} (${rule.level}). Follow the official criterion and Understanding links, including applicability and exceptions.`, props: [], platforms: ['Web', 'Mobile Web'], sourceRuleId: rule.id }); count++;
    });
    setGroup = group.id; commit(before); renderSettings(); status(`${count} WCAG 2.2 tags added.`);
  }

  function createDirectory() {
    if ($('dcaa-wcag-directory')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'dcaa-wcag-directory'; dialog.className = 'dcaa-rule-dialog'; dialog.setAttribute('aria-labelledby', 'dcaa-rules-heading');
    dialog.innerHTML = '<div class="dcaa-rules-header"><div><h2 id="dcaa-rules-heading">WCAG rule directory</h2><p class="hint">Official W3C criterion metadata. Links open a new tab.</p></div><button type="button" data-rules-close>Close</button></div><div class="dcaa-rule-directory-filters"><label>Version<select data-rules-version><option value="2.1">WCAG 2.1</option><option value="2.2">WCAG 2.2</option></select></label><label>Level<select data-rules-level><option value="all">All levels</option><option value="A">A only</option><option value="AA">AA only</option><option value="AAA">AAA only</option></select></label><label>Search<input type="search" data-rules-search placeholder="Criterion number or title"></label></div><p id="dcaa-rules-target" class="hint"></p><p id="dcaa-rules-count" class="hint" role="status"></p><div class="dcaa-rule-table-scroll" role="region" aria-label="WCAG criteria table" tabindex="0"><table><caption>WCAG success criteria</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Level</th><th scope="col">Official resources</th><th scope="col" data-rules-action-head hidden>Tag selection</th></tr></thead><tbody></tbody></table></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('[data-rules-close]').onclick = () => dialog.close();
    dialog.querySelectorAll('select,input').forEach(control => control.addEventListener('input', renderDirectory));
    dialog.addEventListener('close', () => { directoryTarget = null; if (directoryReturnFocus?.isConnected) directoryReturnFocus.focus(); });
  }
  function openDirectory(tag = null) {
    createDirectory(); directoryTarget = tag; directoryReturnFocus = document.activeElement;
    const dialog = $('dcaa-wcag-directory');
    dialog.querySelector('[data-rules-version]').value = versionFor();
    dialog.querySelector('[data-rules-level]').value = 'all';
    dialog.querySelector('[data-rules-search]').value = '';
    renderDirectory(); dialog.showModal(); dialog.querySelector('[data-rules-search]').focus();
  }
  function renderDirectory() {
    const dialog = $('dcaa-wcag-directory'); if (!dialog) return;
    const version = dialog.querySelector('[data-rules-version]').value, level = dialog.querySelector('[data-rules-level]').value;
    const query = dialog.querySelector('[data-rules-search]').value.trim().toLowerCase();
    const activeRules = rulesForVersion(version);
    const filtered = activeRules.filter(rule => (level === 'all' || rule.level === level) && `${rule.id} ${rule.title}`.toLowerCase().includes(query));
    const target = directoryTarget && types().find(tag => tag.id === directoryTarget.id);
    dialog.querySelector('[data-rules-action-head]').hidden = !target;
    $('dcaa-rules-target').textContent = target ? `Choose criteria for “${target.label}”. Existing references are preserved; each addition saves immediately.` : 'The directory lists criterion references, not a conformance assessment.';
    $('dcaa-rules-count').textContent = `${filtered.length} of ${activeRules.length} WCAG ${version} criteria.${version === '2.2' ? ' Parsing (4.1.1) was removed in 2.2.' : ' Criteria introduced in 2.2 are excluded.'}`;
    dialog.querySelector('caption').textContent = `WCAG ${version} success criteria${level === 'all' ? ' — all levels' : ` — Level ${level}`}`;
    const selected = parseIds(target?.wcag);
    dialog.querySelector('tbody').innerHTML = filtered.length ? filtered.map(rule => `<tr><th scope="row">${escape(rule.id)} ${escape(rule.title)}</th><td>${rule.level}</td><td><a href="${rule.url}" target="_blank" rel="noopener noreferrer" aria-label="WCAG ${version} ${escape(rule.id)} ${escape(rule.title)}; opens a new tab">Criterion</a> · <a href="${rule.understandingUrl}" target="_blank" rel="noopener noreferrer" aria-label="Understanding ${escape(rule.id)} ${escape(rule.title)}; opens a new tab">Understanding</a></td>${target ? `<td><button type="button" class="small" data-rule-add="${rule.id}" ${selected.includes(rule.id) ? 'disabled' : ''} aria-label="${selected.includes(rule.id) ? 'Already assigned' : 'Add'} ${escape(rule.id)} ${escape(rule.title)}">${selected.includes(rule.id) ? 'Assigned' : 'Add'}</button></td>` : ''}</tr>`).join('') : `<tr><td colspan="${target ? 4 : 3}">No criteria match this search.</td></tr>`;
    dialog.querySelectorAll('[data-rule-add]').forEach(button => { button.onclick = () => {
      const before = serialize(); target.wcag = [...parseIds(target.wcag), button.dataset.ruleAdd].join('; '); commit(before);
      const row = [...$('libGroups').querySelectorAll('[data-type]')].find(item => item.dataset.type === target.id);
      if (row) { row.querySelector('.wcag textarea').value = target.wcag; refreshTagCriteria(row, target); }
      button.disabled = true; button.textContent = 'Assigned';
      $('dcaa-rules-count').textContent = `Added ${button.dataset.ruleAdd} to “${target.label}”. ${filtered.length} criteria shown.`;
      // Keep a visible focus location after the chosen button becomes disabled.
      const next = [...dialog.querySelectorAll('[data-rule-add]:not(:disabled)')][0];
      (next || dialog.querySelector('[data-rules-search]')).focus();
    }; });
  }

  window.dcaaLibrary = { rules, rulesForVersion, ruleFor, ruleLinks, parseIds, versionFor, platformFor, normalizePlatforms, matchesTag, availability, openDirectory, addReferenceTags, add22Tags, refreshSettings: () => renderSettings() };
})();
