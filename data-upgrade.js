/* Data reliability layer. Append after the original declarations and before boot. */
(() => {
  'use strict';
  const DB = 'dcaa-annotator-studio-v3', KEY = 'project', KV = 'kv';
  const LIMITS = Object.freeze({ imageBytes: 15 * 1024 * 1024, totalImageBytes: 150 * 1024 * 1024,
    bundleBytes: 210 * 1024 * 1024, projectBytes: 8 * 1024 * 1024, pixels: 32e6,
    dimension: 32768, pages: 250, components: 500, images: 751, areas: 20000, steps: 40000 });
  const badKeys = new Set(['__proto__', 'constructor', 'prototype']);
  const borders = new Set(['solid', 'thin', 'double', 'thick_inner', 'dashed', 'dotted', 'dashdot', 'longdash', 'dashdotdot', 'corner_tab']);
  const platforms = new Set(['Web', 'Mobile Web', 'Mobile']);
  const fail = message => { throw new Error(message); };
  const object = (v, name) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${name} must be an object.`); return v; };
  const list = (v, name, max) => { if (!Array.isArray(v) || v.length > max) fail(`${name} must be a list with at most ${max} items.`); return v; };
  const str = (v, name, max = 20000) => { if (typeof v !== 'string' || v.length > max) fail(`${name} must be text of at most ${max} characters.`); return v; };
  const ident = (v, name) => { if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(v) || badKeys.has(v)) fail(`${name} has an unsafe or invalid identifier.`); return v; };
  const num = (v, name, min = 0, max = LIMITS.dimension) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${name} is outside its allowed range.`); return v; };
  const color = (v, name) => {
    if (typeof v !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(v)) fail(`${name} must be a three- or six-digit hexadecimal color.`);
    return v.length === 4 ? '#' + [...v.slice(1)].map(c => c + c).join('') : v;
  };
  const optional = (o, k, check) => { if (o[k] !== undefined) check(o[k], k); };
  const enumValue = (v, values, name) => { if (!values.includes(v)) fail(`${name} is not supported.`); };
  const webUrl = (v, name) => { str(v, name, 4096); try { const u = new URL(v); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); } catch { fail(`${name} must be an HTTP or HTTPS link without credentials.`); } };

  // Unknown extension fields are retained, but cannot contain executable objects,
  // prototype keys, non-JSON values, excessive nesting, or unbounded text.
  function inspectTree(value, name = 'Project') {
    let nodes = 0;
    const walk = (v, depth) => {
      if (++nodes > 400000 || depth > 24) fail(`${name} is too complex.`);
      if (v === null || typeof v === 'boolean') return;
      if (typeof v === 'string') { str(v, name, 100000); return; }
      if (typeof v === 'number') { if (!Number.isFinite(v)) fail(`${name} contains an invalid number.`); return; }
      if (!v || typeof v !== 'object') fail(`${name} contains a non-JSON value.`);
      if (Array.isArray(v)) { if (v.length > 50000) fail(`${name} contains too many items.`); v.forEach(x => walk(x, depth + 1)); return; }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) fail(`${name} contains an unsupported object.`);
      Object.entries(v).forEach(([k, x]) => { if (badKeys.has(k) || k.length > 160) fail(`${name} contains an unsafe property name.`); walk(x, depth + 1); });
    };
    walk(value, 0);
  }

  function imageInfo(data, name) {
    if (typeof data !== 'string' || data.length > Math.ceil(LIMITS.imageBytes / 3) * 4 + 64) fail(`${name} exceeds the 15 MB image limit.`);
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
    if (!match || match[2].length % 4) fail(`${name} must be an embedded PNG, JPEG, WebP, or GIF image.`);
    const bytes = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
    if (bytes > LIMITS.imageBytes) fail(`${name} exceeds the 15 MB image limit.`);
    let head; try { head = atob(match[2].slice(0, 64)); } catch { fail(`${name} has invalid image encoding.`); }
    const format = sniff(head);
    if (format !== match[1]) fail(`${name} has a mismatched or unsupported image signature.`);
    return { bytes, format };
  }
  function sniff(head) {
    if (head.startsWith('\x89PNG\r\n\x1a\n')) return 'png';
    if (head.startsWith('\xff\xd8\xff')) return 'jpeg';
    if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'webp';
    if (/^GIF8[79]a/.test(head)) return 'gif';
    return null;
  }
  function dimensions(w, h, name) {
    num(w, `${name} width`, 1); num(h, `${name} height`, 1);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w * h > LIMITS.pixels) fail(`${name} exceeds the 32 megapixel image limit or has non-integer dimensions.`);
  }
  function rect(r, d, name) {
    object(r, name); num(r.x, `${name} x`); num(r.y, `${name} y`);
    num(r.w, `${name} width`, Number.EPSILON); num(r.h, `${name} height`, Number.EPSILON);
    // Subpixel drags and old rounded crops can differ at the edge by less than a pixel.
    if (r.x + r.w > d.w + 1 || r.y + r.h > d.h + 1) fail(`${name} lies outside its image.`);
  }
  function unique(items, name) {
    const seen = new Set(); items.forEach(x => { ident(x.id, `${name} ID`); if (seen.has(x.id)) fail(`${name} contains a duplicate ID: ${x.id}.`); seen.add(x.id); }); return seen;
  }

  function validateBundle(raw) {
    object(raw, 'Project file');
    if (raw.version !== undefined && ![1, 2].includes(raw.version)) fail('This project file version is not supported.');
    Object.keys(raw).forEach(k => { if (badKeys.has(k)) fail('Project file contains an unsafe key.'); });
    object(raw.project, 'Project'); inspectTree(raw.project);
    if (JSON.stringify(raw.project).length > LIMITS.projectBytes) fail('The project metadata exceeds the 8 MB limit.');
    const p = structuredClone(raw.project), originalImages = object(raw.images || {}, 'Images');
    if (Object.keys(originalImages).length > LIMITS.images) fail('This project contains too many images.');
    const nextImages = {}; let imageBytes = 0;
    Object.entries(originalImages).forEach(([id, data]) => { ident(id, 'Image ID'); imageBytes += imageInfo(data, `Image ${id}`).bytes; if (imageBytes > LIMITS.totalImageBytes) fail('Project images exceed the combined 150 MB limit.'); nextImages[id] = data; });
    list(p.pages, 'Screens', LIMITS.pages);
    if (p.components === undefined) p.components = [];
    list(p.components, 'Components', LIMITS.components);
    const docs = [...p.pages, ...p.components];
    docs.forEach(d => { object(d, 'Screen or component'); list(d.areas, 'Annotations', LIMITS.areas); d.areas.forEach(a => object(a, 'Annotation')); });
    if (p.groups !== undefined) list(p.groups, 'Groups', 200).forEach(g => { object(g, 'Group'); ident(g.id, 'Group ID'); str(g.name, 'Group name', 500); });
    if (p.types !== undefined) list(p.types, 'Annotation types', 2000).forEach(t => { object(t, 'Annotation type'); ident(t.id, 'Type ID'); str(t.label, 'Type label', 500); color(t.color, 'Type color'); });
    // Migrations run against the detached candidate, never the active workspace.
    migrateLibrary(p); migrateProps(p);
    const groupIds = unique(list(p.groups, 'Groups', 200), 'Groups');
    p.groups.forEach(g => str(g.name, 'Group name', 500));
    const typeIds = unique(list(p.types, 'Annotation types', 2000), 'Types');
    p.types.forEach(t => {
      if (!groupIds.has(t.group)) fail(`Type ${t.id} refers to a missing group.`);
      str(t.label, 'Type label', 500); t.color = color(t.color, 'Type color');
      if (!borders.has(t.border)) fail(`Type ${t.id} has an unsupported border.`);
      optional(t, 'description', str); optional(t, 'wcag', (v, k) => str(v, k, 2000));
      optional(t, 'platforms', v => { list(v, 'Type platforms', 3).forEach(x => { if (!platforms.has(x)) fail('Type platform is not supported.'); }); if (new Set(v).size !== v.length) fail('Duplicate type platform.'); });
      const props = t.props || []; unique(list(props, 'Type properties', 100), 'Type properties');
      props.forEach(prop => {
        str(prop.name, 'Property name', 500); enumValue(prop.kind, ['text', 'choice'], 'Property kind');
        optional(prop, 'onLabel', v => { if (typeof v !== 'boolean') fail('Property onLabel must be true or false.'); });
        const options = prop.options || []; list(options, 'Property choices', 200);
        const values = new Set(); options.forEach(o => { object(o, 'Property choice'); str(o.value, 'Choice value', 2000); str(o.label, 'Choice label', 2000); optional(o, 'description', str); if (values.has(o.value)) fail('A property has duplicate choice values.'); values.add(o.value); });
      });
    });
    if (p.defaultType === undefined) p.defaultType = null;
    if (p.lastType === undefined) p.lastType = null;
    if (p.defaultType !== null && p.defaultType !== '__last__' && !typeIds.has(p.defaultType)) fail('The default annotation type is missing.');
    // The original editor retained lastType when that library item was deleted.
    if (p.lastType !== null) { ident(p.lastType, 'Last type'); if (!typeIds.has(p.lastType)) p.lastType = null; }
    optional(p, 'name', (v, k) => str(v, k, 500)); optional(p, 'title', (v, k) => str(v, k, 500));
    optional(p, 'standard', v => enumValue(v, ['2.1', '2.2'], 'Standard'));
    optional(p, 'platform', v => { if (!platforms.has(v)) fail('Project platform is not supported.'); });
    optional(p, 'libraryPreferences', v => {
      object(v, 'Library preferences');
      if (v.version === undefined && v.wcagVersion === undefined) fail('Library WCAG version is missing.');
      optional(v, 'version', x => enumValue(x, ['2.1', '2.2'], 'Library WCAG version'));
      optional(v, 'wcagVersion', x => enumValue(x, ['2.1', '2.2'], 'Library WCAG version'));
      if (v.version && v.wcagVersion && v.version !== v.wcagVersion) fail('Library WCAG version settings disagree.');
      enumValue(v.platform, ['All platforms', 'all', ...platforms], 'Library platform');
    });
    const docIds = unique(docs, 'Screens and components'), compMap = new Map(p.components.map(c => [c.id, c]));
    const pageMap = new Map(p.pages.map(s => [s.id, s]));
    const entityIds = new Set(docIds); let totalAreas = 0, totalSteps = 0, maxCounter = 0;
    const register = (id, name) => { ident(id, name); if (entityIds.has(id)) fail(`Duplicate ${name}: ${id}.`); entityIds.add(id); };
    docs.forEach(d => {
      str(d.name, 'Screen or component name', 500); ident(d.imageId, 'Image reference');
      if (!Object.hasOwn(nextImages, d.imageId)) fail(`${d.name} refers to a missing image.`);
      dimensions(d.w, d.h, d.name);
      const isComponent = compMap.has(d.id);
      if (!isComponent && d.instances === undefined) d.instances = [];
      if (isComponent) { if (d.origin === undefined) d.origin = { x: 0, y: 0 }; object(d.origin, 'Component origin'); num(d.origin.x, 'Component origin x'); num(d.origin.y, 'Component origin y'); }
      totalAreas += d.areas.length; if (totalAreas > LIMITS.areas) fail('This project has too many annotations.');
      const areaIds = new Set();
      d.areas.forEach(a => {
        register(a.id, 'annotation ID'); areaIds.add(a.id); rect(a, d, 'Annotation');
        const ats = [a.type, ...list(a.extra || [], 'Additional types', 100)];
        if (new Set(ats).size !== ats.length || ats.some(id => !typeIds.has(id))) fail('An annotation has missing or duplicate types.');
        optional(a, 'note', str); optional(a, 'owner', (v, k) => str(v, k, 500));
        optional(a, 'status', v => enumValue(v, ['Open', 'In review', 'Resolved'], 'Review status'));
        optional(a, 'severity', v => enumValue(v, ['Guidance', 'Low', 'Medium', 'High'], 'Severity'));
        optional(a, 'wcagVersion', v => enumValue(v, ['2.1', '2.2'], 'Annotation WCAG version'));
        optional(a, 'platform', v => { if (!platforms.has(v)) fail('Annotation platform is not supported.'); });
        optional(a, 'references', v => list(v, 'Reference links', 50).forEach(x => webUrl(x, 'Reference link')));
        if (a.props !== undefined) Object.entries(object(a.props, 'Annotation properties')).forEach(([tid, values]) => {
          ident(tid, 'Property type ID'); Object.entries(object(values, 'Property values')).forEach(([pid, value]) => { ident(pid, 'Property ID'); str(value, 'Property value'); });
        });
      });
      const instances = list(d.instances || [], 'Component instances', 2000), instMap = new Map();
      if (isComponent && instances.length) fail('Nested component instances are not supported.');
      instances.forEach(i => {
        object(i, 'Component instance'); register(i.id, 'instance ID'); ident(i.componentId, 'Component reference');
        const c = compMap.get(i.componentId); if (!c) fail('A screen refers to a missing component.');
        if (i.w == null && i.h == null) { i.w = c.w; i.h = c.h; }
        rect(i, d, 'Component instance'); instMap.set(i.id, i);
      });
      if (d.orders !== undefined) {
        object(d.orders, 'Reading and focus order');
        Object.keys(d.orders).forEach(k => { if (!['reading', 'focus'].includes(k)) fail('Unsupported order sequence.'); });
        for (const mode of ['reading', 'focus']) {
          const steps = list(d.orders[mode] || [], `${mode} order`, LIMITS.steps); totalSteps += steps.length;
          if (totalSteps > LIMITS.steps) fail('This project has too many order steps.');
          steps.forEach(st => {
            object(st, 'Order step'); register(st.id, 'order step ID'); num(st.x, 'Order x', 0, d.w); num(st.y, 'Order y', 0, d.h);
            if (st.areaId !== undefined && st.instId !== undefined) fail('An order step cannot point to both an annotation and a component.');
            if (st.areaId !== undefined) { if (!areaIds.has(st.areaId)) fail('An order step refers to a missing annotation.'); num(st.u, 'Relative order x', 0, 1); num(st.v, 'Relative order y', 0, 1); }
            if (st.instId !== undefined && !instMap.has(st.instId)) fail('An order step refers to a missing component instance.');
            if (st.stepIds !== undefined) {
              if (!st.instId) fail('An order subset needs a component instance.');
              const ids = list(st.stepIds, 'Component order subset', LIMITS.steps), c = compMap.get(instMap.get(st.instId).componentId);
              const allowed = new Set((c.orders?.[mode] || []).map(s => s.id));
              if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !allowed.has(id))) fail('A component order subset contains missing or duplicate steps.');
            }
          });
        }
      }
    });
    p.components.forEach(c => {
      const source = c.sourcePageId ?? c.sourceScreenId;
      if (c.sourcePageId && c.sourceScreenId && c.sourcePageId !== c.sourceScreenId) fail('Component source references disagree.');
      if ((source !== undefined) !== (c.sourceRegion !== undefined)) fail('Component source and source region must be stored together.');
      if (source !== undefined) { ident(source, 'Source screen'); const s = pageMap.get(source); if (!s) fail('A component source screen is missing.'); rect(c.sourceRegion, s, 'Component source region'); }
    });
    if (p.report !== undefined) {
      object(p.report, 'Report settings'); ['title', 'customer', 'by', 'summary'].forEach(k => optional(p.report, k, str));
      optional(p.report, 'color', v => { p.report.color = color(v, 'Report color'); });
      if (p.report.logoId != null) { ident(p.report.logoId, 'Report logo'); if (!Object.hasOwn(nextImages, p.report.logoId)) fail('The report logo image is missing.'); }
    }
    [...entityIds, ...Object.keys(nextImages), ...groupIds, ...typeIds, ...p.types.flatMap(t => (t.props || []).map(v => v.id))].forEach(id => { const m = /(\d+)$/.exec(id); if (m) maxCounter = Math.max(maxCounter, Number(m[1])); });
    if (p.nextId !== undefined && (!Number.isSafeInteger(p.nextId) || p.nextId < 1)) fail('The project ID counter is invalid.');
    p.nextId = Math.max(p.nextId || 1, maxCounter + 1);
    if (!Number.isSafeInteger(p.nextId) || p.nextId > Number.MAX_SAFE_INTEGER - 100000) fail('The project ID counter is too large.');
    return { version: 2, project: p, images: nextImages };
  }

  function decodeImage(data, name) {
    return new Promise((resolve, reject) => {
      const im = new Image(); let done = false;
      const finish = (err) => { if (done) return; done = true; clearTimeout(timer); im.onload = im.onerror = null; if (err) { im.src = ''; reject(err); } else resolve(im); };
      const timer = setTimeout(() => finish(new Error(`${name} took too long to decode.`)), 20000);
      im.onload = () => { try { dimensions(im.naturalWidth, im.naturalHeight, name); finish(); } catch (e) { finish(e); } };
      im.onerror = () => finish(new Error(`${name} is corrupt or cannot be decoded.`)); im.src = data;
    });
  }
  async function validateBundleImages(b) {
    const expected = new Map(); [...b.project.pages, ...b.project.components].forEach(d => {
      const previous = expected.get(d.imageId); if (previous && (previous.w !== d.w || previous.h !== d.h)) fail('The same image has conflicting dimensions.'); expected.set(d.imageId, d);
    });
    for (const [id, data] of Object.entries(b.images)) {
      const im = await decodeImage(data, `Image ${id}`), d = expected.get(id);
      if (d && (im.naturalWidth !== d.w || im.naturalHeight !== d.h)) fail(`The dimensions of ${d.name} do not match its image.`);
      im.src = '';
    }
    return b;
  }
  const api = window.dcaaData = { validateBundle, validateBundleImages, limits: LIMITS, databaseName: DB };
  if (window.DCAA_DATA_TEST_ONLY) return;

  let dbPromise, revision = 0, change = 0, savedChange = 0, saving = null, booted = false, startPromise;
  let conflict = false, recoveryBlocked = false, storageError = '', projectEpoch = 0, importing = false, uploadQueue = Promise.resolve();
  let pendingUploads = 0, activeProjectId = 'project-default', projectOperation = false;
  const CATALOG = 'projects', projectKey = id => `workspace:${ident(id, 'Project ID')}`;
  const writer = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const urls = new Map(); let channel;
  const status = (message, state = 'saved') => {
    const el = $('saveStatus'); if (el) { el.textContent = message; el.dataset.state = state; }
    const retry = $('retrySave'); if (retry) { retry.hidden = !storageError && !conflict && !recoveryBlocked; retry.disabled = !!saving; retry.textContent = recoveryBlocked ? 'Retry opening saved copy' : conflict ? 'Reload saved copy' : 'Retry save'; }
    const backup = $('saveBackup'); if (backup) backup.hidden = false;
  };
  function notice(message, isError = true) {
    let el = $('dataFeedback');
    if (!el) { el = document.createElement('div'); el.id = 'dataFeedback'; el.className = 'data-feedback'; const anchor = $('saveStatus'); (anchor?.parentElement || document.body).appendChild(el); }
    el.replaceChildren(); el.setAttribute('role', isError ? 'alert' : 'status');
    const text = document.createElement('span'); text.textContent = message; el.appendChild(text);
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Dismiss'; close.onclick = () => el.remove(); el.appendChild(close);
  }
  function describeError(error) { return error?.name === 'QuotaExceededError' ? 'Browser storage is full. Download a backup, then free browser storage or use a smaller project.' : error?.message || 'The operation could not be completed.'; }
  function markConflict() { conflict = true; status('Another tab has a newer saved copy. Download a backup of this tab before reloading the saved copy.', 'conflict'); }
  function openDb() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(KV)) r.result.createObjectStore(KV); };
      r.onerror = () => reject(r.error || new Error('Browser storage is unavailable.'));
      r.onblocked = () => reject(new Error('Browser storage is blocked by another tab. Close other copies and retry.'));
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbPromise = null; }; resolve(db); };
    }).catch(e => { dbPromise = null; throw e; });
    return dbPromise;
  }
  async function storedTransaction(keys, mode, update) {
    const db = await openDb(); return new Promise((resolve, reject) => {
      const tx = db.transaction(KV, mode), store = tx.objectStore(KV), values = {}; let remaining = keys.length, result, cause;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(cause || tx.error || new Error('The browser did not finish the storage operation.'));
      for (const key of keys) {
        const req = store.get(key);
        req.onsuccess = () => {
          values[key] = req.result;
          if (--remaining) return;
          try { result = update(values, store); } catch (e) { cause = e; tx.abort(); }
        };
      }
    });
  }
  const readRecord = id => { const key = id ? projectKey(id) : KEY; return storedTransaction([key], 'readonly', values => values[key]); };
  function recordData(record) {
    if (record == null) return { revision: 0, bundle: null };
    if (!Number.isSafeInteger(record.revision) || record.revision < 1 || !record.bundle) fail('The stored copy has an invalid revision. Export your current work before retrying.');
    return record;
  }
  function projectConflict() { const e = new Error('A newer copy of this project was saved in another tab.'); e.name = 'WorkspaceConflict'; throw e; }
  function catalogItems(value) {
    if (value == null) return [];
    if (value.version !== 1 || !Array.isArray(value.items) || value.items.length > 1000) fail('The saved project list is unreadable. Download a backup before retrying.');
    return value.items.map(item => { ident(item.id, 'Saved project ID'); return item; });
  }
  function metadata(record, previous) {
    const p = record.bundle.project, screens = Array.isArray(p.pages) ? p.pages : [], components = Array.isArray(p.components) ? p.components : [];
    return { id: record.projectId, name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Untitled project',
      customer: typeof p.report?.customer === 'string' ? p.report.customer : '', createdAt: previous?.createdAt || record.savedAt || new Date().toISOString(),
      updatedAt: record.savedAt || new Date().toISOString(), revision: record.revision, screenCount: screens.length, componentCount: components.length,
      annotationCount: [...screens, ...components].reduce((n, d) => n + (Array.isArray(d.areas) ? d.areas.length : 0), 0),
      thumbnail: record.thumbnail || null };
  }
  function updateCatalog(store, value, record) {
    const items = catalogItems(value), at = items.findIndex(item => item.id === record.projectId);
    if (at < 0 && items.length >= 1000) fail('This browser already contains 1,000 projects. Export backups before adding more.');
    const item = metadata(record, items[at]); if (at < 0) items.push(item); else items[at] = item;
    store.put({ version: 1, items }, CATALOG);
  }
  let thumbnailSource = null, thumbnailValue = null;
  async function makeThumbnail(candidate) {
    const first = candidate.project.pages[0], source = first && candidate.images[first.imageId];
    if (!source) return null;
    if (source === thumbnailSource) return thumbnailValue;
    try {
      const im = await decodeImage(source, 'Project thumbnail'), c = document.createElement('canvas');
      c.width = 320; c.height = 180; const ctx = c.getContext('2d'); ctx.fillStyle = '#f6f3ed'; ctx.fillRect(0, 0, 320, 180);
      const k = Math.min(320 / im.naturalWidth, 180 / im.naturalHeight);
      ctx.drawImage(im, (320 - im.naturalWidth * k) / 2, (180 - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      const data = c.toDataURL('image/jpeg', .65); im.src = '';
      thumbnailSource = source; thumbnailValue = /^data:image\/(jpeg|png);base64,/.test(data) && data.length < 160000 ? data : null;
      return thumbnailValue;
    } catch { return null; } // A preview must never prevent a project save.
  }
  async function writeRecord(candidate, expected, id = activeProjectId, select = true) {
    const thumbnail = await makeThumbnail(candidate), key = projectKey(id);
    return storedTransaction([key, CATALOG, KEY], 'readwrite', (values, store) => {
      const currentCopy = values[KEY];
      const old = recordData(values[key] || ((!currentCopy?.projectId || currentCopy.projectId === id) && id === 'project-default' ? currentCopy : null));
      if (old.revision !== expected) projectConflict();
      const record = { projectId: id, revision: expected + 1, bundle: candidate, thumbnail, writer, savedAt: new Date().toISOString() };
      store.put(record, key); updateCatalog(store, values[CATALOG], record); if (select) store.put(record, KEY);
      return record.revision;
    });
  }
  function saveOutcome() { return { ok: booted && !conflict && !recoveryBlocked && !storageError && savedChange === change, conflict, error: storageError, revision, projectId: activeProjectId }; }
  function projectsChanged() { window.dispatchEvent(new CustomEvent('dcaa:projects-changed')); }
  async function flush() {
    clearTimeout(saveTimer);
    if (saving) { await saving; return saveOutcome(); }
    if (!booted || conflict || recoveryBlocked || savedChange === change) return saveOutcome();
    saving = (async () => {
      try {
        while (savedChange !== change && !conflict && !recoveryBlocked) {
          const target = change, candidate = validateBundle(bundle());
          status('Saving changes to this browser…', 'saving');
          revision = await writeRecord(candidate, revision); savedChange = target; storageError = '';
          channel?.postMessage({ revision, writer, projectId: activeProjectId }); projectsChanged();
        }
        if (!conflict) status('All changes saved in this browser.', 'saved');
      } catch (e) {
        if (e.name === 'WorkspaceConflict') markConflict();
        else { storageError = describeError(e); status(`Not saved. ${storageError} You can download a backup.`, 'error'); }
      }
    })();
    try { await saving; } finally { saving = null; const retry = $('retrySave'); if (retry) retry.disabled = false; }
    return saveOutcome();
  }
  scheduleSave = function () {
    change++; clearTimeout(saveTimer);
    if (conflict) return markConflict();
    if (recoveryBlocked) return status('The saved project could not be opened. Autosave is paused to preserve it. Download a backup of new edits, then retry opening or import a replacement.', 'error');
    status('Unsaved changes', 'dirty');
    if (booted) saveTimer = setTimeout(flush, 400);
  };
  idb = openDb;
  loadSaved = async function () {
    const initial = recordData(await readRecord());
    if (!initial.bundle) return null;
    activeProjectId = initial.projectId || 'project-default'; const key = projectKey(activeProjectId);
    const record = await storedTransaction([key, CATALOG, KEY], 'readwrite', (values, store) => {
      const current = values[KEY], copy = current && (current.projectId || 'project-default') === activeProjectId ? current : initial;
      const saved = recordData(values[key] || copy); const migrated = { ...saved, projectId: activeProjectId };
      if (!values[key]) store.put(migrated, key);
      updateCatalog(store, values[CATALOG], migrated);
      if (current && (current.projectId || 'project-default') === activeProjectId) store.put(migrated, KEY);
      return migrated;
    });
    revision = record.revision; return record.bundle;
  };
  getImg = function (imageId) {
    if (!imgCache[imageId]) imgCache[imageId] = decodeImage(images[imageId], 'Screen image').catch(e => { delete imgCache[imageId]; notice(describeError(e)); throw e; });
    return imgCache[imageId];
  };
  loadBundle = async function (raw) {
    const epoch = projectEpoch, before = serialize(), valid = validateBundle(raw);
    await validateBundleImages(valid);
    if (epoch !== projectEpoch || before !== serialize()) fail('The current project changed while the file was being checked. Please open it again.');
    const old = { project, images, tabs, current, undoStack, curImg, curImgFor, sel, detail, selStep };
    try {
      project = valid.project; images = valid.images; Object.keys(imgCache).forEach(k => delete imgCache[k]);
      undoStack = []; tabs = []; current = null; curImg = null; curImgFor = null; sel = noSel(); detail = null; selStep = null;
      await openDoc(project.pages.length ? 'page' : 'comp', (project.pages[0] || project.components[0])?.id);
      projectEpoch++;
      window.dispatchEvent(new CustomEvent('dcaa:project-loaded'));
    } catch (e) {
      ({ project, images, tabs, current, undoStack, curImg, curImgFor, sel, detail, selStep } = old);
      Object.keys(imgCache).forEach(k => delete imgCache[k]); refresh(); throw e;
    }
  };

  function readDataFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); let done = false;
      const finish = (e, result) => { if (done) return; done = true; clearTimeout(timer); reader.onload = reader.onerror = reader.onabort = null; e ? reject(e) : resolve(result); };
      const timer = setTimeout(() => { finish(new Error('Reading the file timed out.')); reader.abort(); }, 30000);
      reader.onload = () => finish(null, reader.result);
      reader.onerror = () => finish(new Error(`Could not read ${file.name || 'the image'}.`));
      reader.onabort = () => finish(new Error('Reading the image was cancelled.'));
      try { reader.readAsDataURL(file); } catch (e) { finish(e); }
    });
  }
  async function prepareUpload(file) {
    if (!file || !file.size || file.size > LIMITS.imageBytes) fail('Choose an image between 1 byte and 15 MB.');
    let data = await readDataFile(file);
    const encoded = data.slice(data.indexOf(',') + 1);
    let head; try { head = atob(encoded.slice(0, 16)); } catch { fail('The file does not contain a readable image.'); }
    const format = sniff(head); if (!['png', 'jpeg', 'webp'].includes(format)) fail('Choose a PNG, JPEG, or WebP image.');
    // File.type can be empty or incorrectly supplied by the operating system.
    data = `data:image/${format};base64,${encoded}`;
    imageInfo(data, file.name || 'Image'); const im = await decodeImage(data, file.name || 'Image');
    return { data, w: im.naturalWidth, h: im.naturalHeight };
  }
  function checkImageBudget(data) {
    const current = Object.values(bundle().images).reduce((sum, v) => sum + v.length * .75, 0);
    if (current + data.length * .75 > LIMITS.totalImageBytes) fail('Project images would exceed the combined 150 MB limit.');
  }
  addPages = function (files) {
    if (projectOperation || importing) { notice('Wait for the project to finish opening, then add the images again.'); return Promise.resolve(); }
    const incoming = [...files], epoch = projectEpoch;
    pendingUploads++;
    uploadQueue = uploadQueue.then(async () => {
      if (!booted || importing || projectOperation || epoch !== projectEpoch) { notice('Wait for the project to finish opening, then add the images again.'); return; }
      let last, count = 0; const errors = [];
      for (const f of incoming.slice(0, LIMITS.pages)) {
        try {
          if (project.pages.length >= LIMITS.pages) fail('The project already has 250 screens.');
          const item = await prepareUpload(f);
          if (epoch !== projectEpoch) fail('The project changed while this image was loading. Add it again to the current project.');
          checkImageBudget(item.data);
          const before = serialize(), imageId = uid('img');
          last = { id: uid('page'), name: (f.name.replace(/\.[^.]+$/, '') || `Screen ${project.pages.length + 1}`).slice(0, 500), imageId, w: item.w, h: item.h, areas: [], instances: [] };
          images[imageId] = item.data; project.pages.push(last); commit(before); count++;
        } catch (e) { errors.push(`${f.name || 'Image'}: ${describeError(e)}`); }
      }
      if (incoming.length > LIMITS.pages) errors.push('Only the first 250 selected files were processed.');
      if (last && epoch === projectEpoch) await openDoc('page', last.id);
      if (errors.length) notice(`${count} image${count === 1 ? '' : 's'} added. ${errors.slice(0, 8).join(' ')}${errors.length > 8 ? ` ${errors.length - 8} more files failed.` : ''}`);
      else if (count) notice(`${count} image${count === 1 ? '' : 's'} added.`, false);
    }).catch(e => notice(describeError(e))).finally(() => { pendingUploads--; });
    return uploadQueue;
  };

  // Capture listeners replace the original anonymous handlers without cloning inputs.
  $('openProject').addEventListener('change', async e => {
    e.stopImmediatePropagation(); const f = e.target.files?.[0]; e.target.value = ''; if (!f || importing) return;
    if (projectOperation || pendingUploads) { notice('Wait for the current upload or project operation to finish, then import the file again.'); return; }
    importing = true;
    try {
      if (f.size > LIMITS.bundleBytes) fail('Project files must be smaller than 210 MB.');
      const raw = JSON.parse(await f.text());
      await importBackup(raw, f.name);
      notice('Backup opened as a separate project. Your previous project is still available in Projects.', false);
    } catch (e) { notice(`Project was not opened. ${describeError(e)}`); }
    finally { importing = false; }
  }, true);
  $('logoFile').addEventListener('change', async e => {
    e.stopImmediatePropagation(); const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (projectOperation || importing) { notice('Wait for the project to finish opening, then add the logo again.'); return; }
    const epoch = projectEpoch;
    pendingUploads++;
    try {
      const item = await prepareUpload(f); if (epoch !== projectEpoch) fail('The project changed while the logo was loading.');
      checkImageBudget(item.data); const before = serialize(), imageId = uid('img'); images[imageId] = item.data;
      report().logoId = imageId; commit(before); showLogo();
    } catch (e) { notice(`Logo was not added. ${describeError(e)}`); }
    finally { pendingUploads--; }
  }, true);

  download = function (href, name) {
    const a = document.createElement('a'); a.href = href; a.download = name; a.hidden = true;
    document.body.appendChild(a);
    try { a.click(); }
    finally { a.remove(); if (href.startsWith('blob:')) { clearTimeout(urls.get(href)); urls.set(href, setTimeout(() => { URL.revokeObjectURL(href); urls.delete(href); }, 60000)); } }
  };
  function backup() {
    try { download(URL.createObjectURL(new Blob([JSON.stringify(bundle())], { type: 'application/json' })), 'annotation-project.json'); notice('Project backup prepared. Your browser handles saving the file.', false); }
    catch (e) { notice(`Could not prepare a backup. ${describeError(e)}`); }
  }
  $('saveProject').onclick = backup;
  const originalSync = syncButtons;
  syncButtons = function () { originalSync(); $('saveProject').disabled = false; };
  const jsonExport = $('exportJson').onclick;
  $('exportJson').onclick = () => { try { validateBundle(bundle()); jsonExport(); } catch (e) { notice(`JSON export failed. ${describeError(e)}`); } };
  $('exportPng').onclick = () => {
    const d = doc(); if (!d) return;
    const keepSel = sel, keepView = view;
    try {
      const padX = isPage() ? 0 : Math.max(COMP_MARGIN, (COMP_MIN_WIDTH - d.w) / 2), padY = isPage() ? 0 : COMP_MARGIN;
      const w = Math.ceil(d.w + 2 * padX), h = Math.ceil(d.h + 2 * padY); dimensions(w, h, 'PNG export');
      sel = noSel(); view = { zoom: 1, padX, padY, k: 1, forceScale: 1 }; canvas.width = w; canvas.height = h; render();
      const data = canvas.toDataURL('image/png'); if (data === 'data:,') fail('The browser could not create an image at this size.');
      download(data, `${fileName(d.name)}.png`);
    } catch (e) { notice(`PNG export failed. ${describeError(e)}`); }
    finally { sel = keepSel; view = keepView; layoutCanvas(); render(); }
  };

  window.addEventListener('beforeunload', e => { if (savedChange !== change || saving || importing || pendingUploads || projectOperation) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
  window.addEventListener('pagehide', () => { for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); } urls.clear(); });
  try {
    channel = new BroadcastChannel(DB);
    channel.onmessage = e => {
      if (e.data?.writer === writer) return;
      if (booted && (e.data?.projectId || 'project-default') === activeProjectId && Number.isSafeInteger(e.data?.revision) && e.data.revision > revision) markConflict();
      projectsChanged();
    };
  } catch { /* Atomic IndexedDB revision checks still protect browsers without BroadcastChannel. */ }
  if ($('saveBackup')) $('saveBackup').onclick = backup;
  if ($('retrySave')) $('retrySave').onclick = async () => {
    if (conflict || recoveryBlocked) {
      if (!await askDialog({ title: 'Reload the saved project?', msg: 'This discards this tab’s unsaved edits. Use Download backup first to keep them.', input: false, ok: 'Reload saved copy' })) return;
      try {
        const stored = await readRecord(activeProjectId), legacy = !stored && activeProjectId === 'project-default' ? await readRecord() : null;
        const record = recordData(stored || (legacy && !legacy.projectId ? legacy : null)); if (!record.bundle) fail('There is no saved project to reload.');
        await loadBundle(record.bundle); revision = record.revision; savedChange = change; conflict = false; recoveryBlocked = false; storageError = '';
        status('Saved copy reloaded. All changes saved in this browser.');
        if (JSON.stringify(record.bundle.project) !== serialize()) scheduleSave();
      } catch (e) { notice(describeError(e)); }
    } else { storageError = ''; if (savedChange === change) change++; await flush(); }
  };
  api.flush = flush; api.backup = backup; api.notice = notice;
  api.currentProject = () => ({ id: activeProjectId, name: project.name || 'Untitled project', customer: project.report?.customer || '', ...saveOutcome() });
  api.listProjects = () => storedTransaction([CATALOG], 'readonly', values => catalogItems(values[CATALOG]).map(item => ({ ...item })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
  async function projectTask(operation) {
    if (!booted) fail('Wait for the saved project to finish opening.');
    if (projectOperation || importing || pendingUploads) fail('Wait for the current upload or project operation to finish.');
    projectOperation = true;
    try { return await operation(); } finally { projectOperation = false; projectsChanged(); }
  }
  async function requireSaved() {
    if (!revision && !conflict && !recoveryBlocked) scheduleSave();
    const result = await flush();
    if (!result.ok) fail('The current project has not finished saving. Use Retry save or Save backup before switching projects. Your current work is still open.');
  }
  function projectName(value) { str(value, 'Project name', 200); const name = value.trim(); if (!name) fail('Enter a project name.'); return name; }
  function customerName(value) { str(value, 'Customer', 500); return value.trim(); }
  function newProjectId() { return `project-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)}`; }
  async function activateProject(id, saved, recoveryImport = false) {
    ident(id, 'Project ID'); const record = recordData(saved || await readRecord(id));
    if (!record.bundle) fail('This saved project could not be found.');
    if (!(recoveryImport && recoveryBlocked && savedChange === change)) await requireSaved();
    clearTimeout(saveTimer);
    await loadBundle(record.bundle); // Runs library/editor wrappers, and preflights every image before replacement.
    activeProjectId = id; revision = record.revision; savedChange = change; conflict = false; recoveryBlocked = false; storageError = '';
    try {
      await storedTransaction([projectKey(id)], 'readwrite', (values, store) => {
        const latest = recordData(values[projectKey(id)]); if (latest.revision !== revision) projectConflict();
        store.put(latest, KEY);
      });
    } catch (e) {
      if (e.name === 'WorkspaceConflict') markConflict();
      else { storageError = describeError(e); status(`Project opened, but its selection was not saved. ${storageError}`, 'error'); }
      throw e;
    }
    status('Project opened. Saved in this browser.');
    // Stamp/library migrations can edit a detached loaded project. Persist their changes in this project's record.
    if (JSON.stringify(record.bundle.project) !== serialize()) scheduleSave();
    window.dispatchEvent(new CustomEvent('dcaa:active-project-changed'));
    return api.currentProject();
  }
  api.openProject = id => projectTask(async () => {
    await requireSaved(); if (id === activeProjectId) return api.currentProject();
    return activateProject(id);
  });
  api.saveCurrentProject = () => projectTask(async () => { await requireSaved(); return api.currentProject(); });
  api.createProject = (name, customer = '') => projectTask(async () => {
    name = projectName(name); customer = customerName(customer); await requireSaved();
    const candidate = validateBundle({ version: 2, project: { name, pages: [], components: [], groups: structuredClone(DEFAULT_GROUPS), types: structuredClone(DEFAULT_TYPES),
      nextId: 1, defaultType: '__last__', lastType: null, report: { title: `${name} accessibility report`, customer, by: '', color: '#2e5f7a', summary: '', logoId: null } }, images: {} });
    const id = newProjectId(); await writeRecord(candidate, 0, id, false); const result = await activateProject(id); await flush(); return result;
  });
  api.renameProject = (id, name, customer = '') => projectTask(async () => {
    ident(id, 'Project ID'); name = projectName(name); customer = customerName(customer); await requireSaved();
    if (id === activeProjectId) {
      const before = serialize(); project.name = name; report().customer = customer; commit(before);
      const result = await flush(); if (!result.ok) fail('The name changed in this tab, but could not be saved. Retry saving or download a backup.');
    } else {
      const record = recordData(await readRecord(id)); if (!record.bundle) fail('This saved project could not be found.');
      const candidate = validateBundle(record.bundle); candidate.project.name = name; candidate.project.report ||= {}; candidate.project.report.customer = customer;
      const next = await writeRecord(candidate, record.revision, id, false); channel?.postMessage({ projectId: id, revision: next, writer });
    }
    return api.currentProject();
  });
  api.duplicateProject = id => projectTask(async () => {
    ident(id, 'Project ID'); await requireSaved(); const record = recordData(await readRecord(id)); if (!record.bundle) fail('This saved project could not be found.');
    const candidate = validateBundle(record.bundle), newId = newProjectId(); candidate.project.name = `${candidate.project.name || 'Untitled project'} copy`.slice(0, 200);
    await writeRecord(candidate, 0, newId, false); channel?.postMessage({ projectId: newId, revision: 1, writer }); return { id: newId, name: candidate.project.name };
  });
  async function importBackup(raw, filename = '') {
    const candidate = validateBundle(raw); await validateBundleImages(candidate);
    // A corrupt saved copy remains in its own record. Recovery imports are safe only before any new edits.
    if (!(recoveryBlocked && savedChange === change)) await requireSaved();
    candidate.project.name = (candidate.project.name?.trim() || filename.replace(/\.json$/i, '').trim() || candidate.project.report?.title?.trim() || 'Imported project').slice(0, 200);
    const id = newProjectId(); await writeRecord(candidate, 0, id, false);
    // Import can wait on a thumbnail or disk. Save edits made to the old project during that wait before switching.
    if (!(recoveryBlocked && savedChange === change)) await requireSaved();
    await activateProject(id, undefined, true); return api.currentProject();
  }
  api.importProject = (raw, filename) => projectTask(() => importBackup(raw, filename));
  api.start = function () {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const previousInert = document.body.inert; document.body.inert = true; status('Opening saved project…', 'loading');
      let foundSaved = false;
      try {
        const saved = await loadSaved(); foundSaved = !!saved; if (saved) await loadBundle(saved); else refresh();
        savedChange = change; status(saved ? 'Saved project opened from this browser.' : 'Ready. Changes save to this browser.');
      } catch (e) {
        storageError = describeError(e); recoveryBlocked = foundSaved; refresh();
        status(foundSaved ? `Saved project was not opened. ${storageError} Autosave is paused to preserve that copy. Import a backup or retry opening it.` : `Could not open browser storage. ${storageError} Import a backup or retry saving.`, 'error');
      }
      finally { booted = true; document.body.inert = previousInert; syncButtons(); }
    })();
    return startPromise;
  };
})();
