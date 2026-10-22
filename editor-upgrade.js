/* Standalone editor extension. Appended after original definitions, before boot. */
const EU = {
  redoStack: [],
  region(raw, d, pixels = false) {
    const values = [raw.x, raw.y, raw.w, raw.h, d.w, d.h];
    if (!values.every(Number.isFinite) || d.w < 1 || d.h < 1 || raw.w <= 0 || raw.h <= 0) throw new Error('Enter finite coordinates and a positive width and height.');
    let x = clamp(raw.x, 0, d.w - 1), y = clamp(raw.y, 0, d.h - 1);
    let right = clamp(raw.x + raw.w, x + 1, d.w), bottom = clamp(raw.y + raw.h, y + 1, d.h);
    if (pixels) { x = Math.floor(x); y = Math.floor(y); right = Math.ceil(right); bottom = Math.ceil(bottom); }
    return { x, y, w: right - x, h: bottom - y };
  },
  safeReference(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
  },
  metadata(a) { return { note: a.note || '', status: a.status || 'Open', severity: a.severity || 'Guidance', owner: a.owner || '', references: (a.references || []).map(EU.safeReference).filter(Boolean) }; },
  announce(message) { $('eu-status').textContent = message; },
  cleanReferences(before, state = project) {
    const old = before ? JSON.parse(before) : state;
    [...state.pages, ...state.components].forEach(d => {
      const sourceId = d.sourcePageId || d.sourceScreenId;
      if (sourceId && !state.pages.some(p => p.id === sourceId)) { delete d.sourcePageId; delete d.sourceScreenId; delete d.sourceRegion; }
      const prior = [...old.pages, ...old.components].find(x => x.id === d.id);
      ['reading', 'focus'].forEach(m => {
        if (!d.orders?.[m]) return;
        d.orders[m] = d.orders[m].filter(st => {
          if (st.instId) {
            const inst = d.instances?.find(i => i.id === st.instId), c = inst && state.components.find(c => c.id === inst.componentId); if (!c) return false;
            if (st.stepIds) { st.stepIds = st.stepIds.filter(id => c.orders?.[m]?.some(s => s.id === id)); if (!st.stepIds.length) return false; }
            st.x = inst.x; st.y = inst.y;
            return true;
          }
          const attached = st.areaId && d.areas.find(a => a.id === st.areaId);
          if (attached) { st.x = attached.x + (st.u ?? .5) * attached.w; st.y = attached.y + (st.v ?? .5) * attached.h; }
          else if (st.areaId) {
            const a = prior?.areas.find(a => a.id === st.areaId);
            if (a) { st.x = a.x + (st.u ?? .5) * a.w; st.y = a.y + (st.v ?? .5) * a.h; }
            delete st.areaId; delete st.u; delete st.v;
          }
          return true;
        });
      });
    });
    if (state.lastType && !state.types.some(t => t.id === state.lastType)) state.lastType = null;
  },
  transferOrders(source, component, instance, box, movingIds, makeId) {
    component.orders = { reading: [], focus: [] };
    ['reading', 'focus'].forEach(m => {
      const list = source.orders?.[m] || [], captured = new Set();
      list.forEach(st => {
        if (st.instId) return;
        const a = st.areaId && source.areas.find(a => a.id === st.areaId);
        const p = a ? { x: a.x + st.u * a.w, y: a.y + st.v * a.h } : st;
        if (st.areaId ? movingIds.has(st.areaId) : inside(p, box)) {
          captured.add(st.id);
          component.orders[m].push({ ...structuredClone(st), x: p.x - box.x, y: p.y - box.y });
        }
      });
      const runs = []; let run = null;
      list.forEach(st => { if (captured.has(st.id)) { if (!run) { run = []; runs.push(run); } run.push(st.id); } else run = null; });
      if (!captured.size) return;
      let runIndex = 0, inRun = false;
      source.orders[m] = list.flatMap(st => {
        if (!captured.has(st.id)) { inRun = false; return [st]; }
        if (inRun) return [];
        inRun = true;
        const ids = runs[runIndex++];
        return [{ id: makeId('o'), x: instance.x, y: instance.y, instId: instance.id, ...(runs.length > 1 ? { stepIds: ids } : {}) }];
      });
    });
  },
  prepareCapture(rawBundle, sourceId, rawBox, name, encoded, replaceAreaId) {
    const data = window.dcaaData;
    if (typeof data?.validateBundle !== 'function') throw new Error('Project validation is unavailable. Reload the tool before creating a component.');
    const state = structuredClone(rawBundle.project), source = state.pages.find(p => p.id === sourceId);
    if (!source) throw new Error('The source screen is no longer available.');
    if (state.components.length >= (data.limits?.components || 500)) throw new Error('This project already contains 500 components. Remove a component before creating another.');
    const box = EU.region(rawBox, source, true);
    if (box.w * box.h > (data.limits?.pixels || 32000000) || box.w > 32768 || box.h > 32768) throw new Error('This crop exceeds the 32 megapixel image limit. Choose a smaller region.');
    const makeId = prefix => prefix + (state.nextId++), imageId = makeId('img');
    const moving = source.areas.filter(a => a.id !== replaceAreaId && contains(box,a));
    const component = {id:makeId('comp'),name,imageId,w:box.w,h:box.h,origin:{x:box.x,y:box.y},sourcePageId:source.id,sourceRegion:{...box},areas:moving.map(a=>({...structuredClone(a),x:a.x-box.x,y:a.y-box.y}))};
    const instance = {id:makeId('i'),componentId:component.id,...box};
    EU.transferOrders(source,component,instance,box,new Set(moving.map(a=>a.id)),makeId);
    state.components.push(component);source.areas=source.areas.filter(a=>a.id!==replaceAreaId&&!moving.includes(a));source.instances.push(instance);
    EU.cleanReferences(JSON.stringify(rawBundle.project),state);
    // The validator checks PNG size, combined images, project limits, geometry and references.
    // No live project, image store, ID counter or history has changed if it rejects this candidate.
    const valid=data.validateBundle({version:rawBundle.version||2,project:state,images:{...rawBundle.images,[imageId]:encoded}});
    return {bundle:valid,componentId:component.id};
  }
};
window.dcaaEditor = EU;

/* Announcements and stable command buttons survive canvas and detail rerenders. */
const euStatus = document.createElement('div'); euStatus.id = 'eu-status'; euStatus.className = 'sr'; euStatus.setAttribute('role', 'status'); euStatus.setAttribute('aria-live', 'polite'); document.body.append(euStatus);
const euCommands = document.createElement('div'); euCommands.id = 'eu-commands'; euCommands.hidden = true;
euCommands.innerHTML = '<div class="eu-document"><h2 id="eu-doc-title" tabindex="-1"></h2><button type="button" id="eu-source" class="small" hidden>Open source screen</button></div><div class="eu-command-buttons" role="group" aria-label="Keyboard editing tools"><button type="button" id="eu-add" class="small">Add annotation</button><button type="button" id="eu-geometry" class="small">Edit position & size</button><button type="button" id="eu-capture" class="small">Create component</button></div>';
$('viewBar').after(euCommands);
const euRedo = document.createElement('button'); euRedo.type = 'button'; euRedo.id = 'redo'; euRedo.className = 'tb'; euRedo.setAttribute('aria-label', 'Redo'); euRedo.dataset.tip = 'Redo (Ctrl/⌘ Shift Z)'; euRedo.textContent = '↷'; euRedo.disabled = true; $('undo').after(euRedo);

/* Undo/redo retains the existing serialized project history and image store. */
const euOriginalPushUndo = pushUndo;
pushUndo = function(before) { EU.redoStack.length = 0; euOriginalPushUndo(before); };
const euOriginalCommit = commit;
commit = function(before) { EU.cleanReferences(before); euOriginalCommit(before); };
const euOriginalUndo = undo;
undo = function() {
  if (!undoStack.length) return;
  EU.redoStack.push(serialize()); if (EU.redoStack.length > 100) EU.redoStack.shift();
  detail = null; detailKey = null; selStep = null; euOriginalUndo(); EU.announce('Change undone.'); syncButtons();
};
EU.redo = function() {
  if (!EU.redoStack.length) return;
  euOriginalPushUndo(serialize()); project = JSON.parse(EU.redoStack.pop());
  sel = noSel(); detail = null; detailKey = null; selStep = null; hidePicker(); pruneTabs(); scheduleSave(); activate(); EU.announce('Change restored.');
};
$('undo').onclick = undo; euRedo.onclick = EU.redo;
const euOriginalSyncButtons = syncButtons;
syncButtons = function() { euOriginalSyncButtons(); euRedo.disabled = !EU.redoStack.length; };
const euOriginalLoadBundle = loadBundle;
loadBundle = async function(...args) { const result = await euOriginalLoadBundle(...args); EU.redoStack.length = 0; detailKey = null; syncButtons(); return result; };

/* Subsets preserve interleaved reading/focus order when a capture becomes shared. */
flatOrder = function(d, m) {
  const out = [];
  orderOf(d, m).forEach(st => {
    if (st.instId) {
      const inst = d.instances?.find(i => i.id === st.instId), c = inst && comp(inst.componentId); if (!c) return;
      const allowed = st.stepIds ? new Set(st.stepIds) : null;
      const inner = flatOrder(c, m).filter(f => !allowed || allowed.has(f.step.id));
      if (!inner.length) out.push({ x: inst.x + inst.w / 2, y: inst.y + inst.h / 2, step: st, block: c, empty: true, label: `◆ ${c.name}` });
      inner.forEach(f => out.push({ x: inst.x + f.x * inst.w / c.w, y: inst.y + f.y * inst.h / c.h, step: st, block: c, label: `◆ ${c.name} › ${f.label}` }));
    } else {
      const a = st.areaId && d.areas.find(x => x.id === st.areaId);
      out.push({ ...stepPos(d, st), step: st, label: a ? `${d.areas.indexOf(a) + 1}. ${typeLabel(a)}` : 'Point' });
    }
  });
  let n = 0; out.forEach(f => { if (!f.empty) f.n = ++n; }); return out;
};

EU.cancelDrag = function() {
  const snapshot = drag?.before || odrag?.before;
  drag = null; odrag = null;
  if (snapshot) { project = JSON.parse(snapshot); sel = noSel(); detail = null; detailKey = null; selStep = null; refresh(); EU.announce('Drag canceled; the previous position is restored.'); }
};
canvas.addEventListener('pointercancel', EU.cancelDrag, true);
window.addEventListener('blur', () => { if (drag || odrag) EU.cancelDrag(); });
window.addEventListener('keydown', e => {
  const modal = document.querySelector('dialog[open]');
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (modal) { if (e.key === 'Escape' || (!typing && ['Delete', 'Backspace'].includes(e.key)) || (!typing && (e.ctrlKey || e.metaKey) && ['z','y','\\','=','+','-','0'].includes(e.key.toLowerCase()))) e.stopImmediatePropagation(); return; }
  if (e.key === 'Escape' && (drag || odrag)) { e.preventDefault(); e.stopImmediatePropagation(); EU.cancelDrag(); return; }
  if ((e.ctrlKey || e.metaKey) && !typing && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) { e.preventDefault(); e.stopImmediatePropagation(); EU.redo(); }
}, true);

/* Shared native geometry dialog: coordinates are original image pixels. */
EU.geometryDialog = function({ source, bounds, kind = 'region', title, name = '', onApply, afterApply }) {
  const pointOnly = kind === 'point', capture = kind === 'capture', opener = document.activeElement;
  const dialog = document.createElement('dialog'); dialog.className = 'eu-dialog'; dialog.setAttribute('aria-labelledby', 'eu-dialog-title'); dialog.setAttribute('aria-describedby', 'eu-dialog-help');
  dialog.innerHTML = `<form><div class="eu-dialog-heading"><h2 id="eu-dialog-title">${esc(title)}</h2><button type="button" class="icon eu-close" aria-label="Close dialog">✕</button></div><p class="hint" id="eu-dialog-help">${capture ? 'Extract a separate component image. Enclosed annotations and their reading/focus order move with it.' : pointOnly ? 'Choose a position without dragging. Coordinates use the original image pixels.' : 'Use these fields to create, move, or resize a region without dragging.'} Source: ${source.w} × ${source.h} pixels.</p>${capture ? '<label class="eu-field">Component name<input name="name" type="text" required maxlength="120" autocomplete="off"></label><div class="eu-crop-shell"><div class="eu-crop-preview"><img alt="Preview of selected component region"></div></div><p class="hint eu-crop-size"></p>' : ''}<fieldset class="eu-geometry"><legend>${pointOnly ? 'Point position' : 'Region bounds'}</legend><div class="eu-coordinate-grid">${(pointOnly ? ['x','y'] : ['x','y','w','h']).map(k => `<label>${({ x:'Left',y:'Top',w:'Width',h:'Height' })[k]} (px)<input name="${k}" type="number" step="any" min="${k === 'w' || k === 'h' ? 1 : 0}" max="${k === 'x' || k === 'w' ? source.w : source.h}" required></label>`).join('')}</div></fieldset><p class="eu-dialog-error" role="alert" hidden></p><div class="eu-dialog-actions"><button type="button" class="eu-cancel">Cancel</button><button type="submit" class="primary">${capture ? 'Create & annotate' : 'Apply'}</button></div><p class="hint eu-busy" role="status"></p></form>`;
  document.body.append(dialog); const form = dialog.querySelector('form'), error = dialog.querySelector('.eu-dialog-error'); let busy = false, success = false;
  if (capture) { form.elements.name.value = name; dialog.querySelector('img').src = images[source.imageId]; }
  (pointOnly ? ['x','y'] : ['x','y','w','h']).forEach(k => { form.elements[k].value = Number(bounds[k].toFixed(2)); });
  const read = () => {
    const x = Number(form.elements.x.value), y = Number(form.elements.y.value);
    if (pointOnly) { if (![x,y].every(Number.isFinite)) throw new Error('Enter finite coordinates.'); return { x: clamp(x,0,source.w), y: clamp(y,0,source.h) }; }
    return EU.region({ x, y, w:Number(form.elements.w.value), h:Number(form.elements.h.value) }, source, capture);
  };
  const preview = () => {
    if (!capture) return;
    try { const r = read(), target = dialog.querySelector('.eu-crop-preview'), image = target.querySelector('img'), aspect = r.w / r.h;
      Object.assign(target.style, { width: Math.min(480,180*aspect)+'px', aspectRatio:String(aspect) });
      Object.assign(image.style, { width:source.w/r.w*100+'%', left:-r.x/r.w*100+'%', top:-r.y/r.h*100+'%' });
      dialog.querySelector('.eu-crop-size').textContent = `${r.w} × ${r.h} pixels · Left ${r.x}, top ${r.y}`;
    } catch { dialog.querySelector('.eu-crop-size').textContent = 'Enter valid bounds to preview the component.'; }
  };
  form.addEventListener('input', preview); preview();
  const close = () => { if (!busy) dialog.close(); };
  dialog.querySelector('.eu-close').onclick = close; dialog.querySelector('.eu-cancel').onclick = close;
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (!success && opener?.isConnected && opener !== document.body) opener.focus(); else if (!success) (capture ? $('eu-capture') : $('eu-add'))?.focus(); }, { once:true });
  form.onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    try {
      const r = read(), componentName = capture ? form.elements.name.value.trim() : '';
      if (capture && !componentName) throw new Error('Enter a component name.');
      busy = true; error.hidden = true; dialog.querySelector('.eu-busy').textContent = capture ? 'Creating the component image…' : 'Applying changes…';
      form.querySelectorAll('input,button').forEach(el => { el.disabled = true; });
      await onApply(r, componentName); success = true; dialog.close();
      requestAnimationFrame(() => { $('eu-doc-title')?.focus(); afterApply?.(); });
    } catch (cause) {
      busy = false; form.querySelectorAll('input,button').forEach(el => { el.disabled = false; });
      error.hidden = false; error.textContent = cause instanceof Error ? cause.message : 'The operation could not be completed.'; dialog.querySelector('.eu-busy').textContent = ''; error.tabIndex = -1; error.focus();
    }
  };
  dialog.showModal(); (capture ? form.elements.name : form.elements.x).focus();
  return dialog;
};

/* Capture is transactional: encoding must succeed before project mutation. */
captureComponent = async function(raw, replaceArea) {
  const source = doc(); if (!source || !isPage()) return;
  let initial; try { initial = EU.region(raw, source, true); } catch (cause) { EU.announce(cause.message); return; }
  return EU.geometryDialog({ source, bounds: initial, kind:'capture', title:'Create common component', name:project.components.length ? '' : 'Header', onApply:async (box,name) => {
    if (!project.pages.includes(source)) throw new Error('The source screen is no longer available.');
    if (project.components.length >= (window.dcaaData?.limits?.components || 500)) throw new Error('This project already contains 500 components. Remove a component before creating another.');
    if (box.w * box.h > (window.dcaaData?.limits?.pixels || 32000000) || box.w > 32768 || box.h > 32768) throw new Error('This crop exceeds the 32 megapixel image limit. Choose a smaller region.');
    const image = await getImg(source.imageId), crop = document.createElement('canvas');
    let encoded;
    try {
      crop.width = box.w; crop.height = box.h; const context = crop.getContext('2d');
      if (!context) throw new Error('The browser could not create a component image.');
      context.drawImage(image, box.x,box.y,box.w,box.h, 0,0,box.w,box.h); encoded = crop.toDataURL('image/png');
      if (!encoded.startsWith('data:image/png;') || encoded.length < 30) throw new Error('The component image could not be encoded. Choose a smaller region.');
    } finally { crop.width = 0; crop.height = 0; }
    if (!project.pages.includes(source)) throw new Error('The project changed while preparing the crop. Try again.');
    const before = serialize(), proposed = EU.prepareCapture(bundle(),source.id,box,name,encoded,replaceArea?.id);
    project=proposed.bundle.project;images={...images,...proposed.bundle.images};
    setCapture(false); sel = noSel(); detail = null; detailKey = null; commit(before);
    await openDoc('comp',proposed.componentId); EU.announce(`Created ${name}. Shared annotations are ready to edit.`);
  }});
};

EU.addRegion = function() {
  const source = doc(); if (!source) return;
  if (mode !== 'ann') {
    const orderMode = mode;
    return EU.geometryDialog({ source,bounds:{x:source.w/2,y:source.h/2},kind:'point',title:`Add ${ORDER[orderMode].label.toLowerCase()} point`,onApply:p=>{
      if (doc() !== source || mode !== orderMode) throw new Error('The active view changed. Try again.');
      addStep(p,serialize()); EU.announce('Order point added.');
    }});
  }
  let created;
  EU.geometryDialog({source,bounds:{x:source.w*.35,y:source.h*.4,w:Math.max(1,source.w*.3),h:Math.max(1,source.h*.2)},title:'Add annotation region',onApply:box=>{
    if(doc()!==source)throw new Error('The active screen changed. Try again.');
    const before=serialize(),preferred=project.defaultType==='__last__'?project.lastType:project.defaultType;
    created={id:uid('a'),...box,type:types().some(t=>t.id===preferred)?preferred:types()[0]?.id||'none',note:'',status:'Open',severity:'Guidance',owner:'',references:[]};
    const lib=window.dcaaLibrary;if(lib){created.wcagVersion=lib.versionFor();created.platform=lib.platformFor();}
    source.areas.push(created);sel={area:created.id,inst:null};commit(before);EU.announce('Region created. Choose its annotation types.');
  },afterApply:()=>{const r=$('eu-add').getBoundingClientRect();showPicker(created,r.left,r.bottom,true);}});
};
EU.editGeometry = function() {
  const source=doc();if(!source)return;
  if(mode!=='ann'){
    const step=orderOf(source,mode).find(st=>st.id===selStep);if(!step)return;
    if(step.instId){EU.announce('This step uses a shared component. Edit its order inside the component.');return;}
    const orderMode=mode;
    return EU.geometryDialog({source,bounds:stepPos(source,step),kind:'point',title:'Edit order point position',onApply:p=>{if(doc()!==source||mode!==orderMode)throw new Error('The active view changed. Try again.');const before=serialize();placeStep(step,p);commit(before);EU.announce('Order point position updated.');}});
  }
  const target=selArea()||selInst();if(!target)return;
  EU.geometryDialog({source,bounds:target,title:'Edit region position & size',onApply:box=>{if(doc()!==source)throw new Error('The active screen changed. Try again.');const before=serialize();Object.assign(target,box);commit(before);EU.announce('Region position and size updated.');}});
};
$('eu-add').onclick=EU.addRegion;$('eu-geometry').onclick=EU.editGeometry;
$('eu-capture').onclick=()=>{const d=doc();if(!d||!isPage())return;const r={x:d.w*.2,y:d.h*.2,w:Math.max(1,d.w*.6),h:Math.max(1,d.h*.4)};captureComponent(r);};
const euOriginalViewStats=renderViewStats;
renderViewStats=function(){
  euOriginalViewStats();const d=doc();euCommands.hidden=!d;if(!d)return;
  $('eu-doc-title').textContent=(isPage()?'':'Component · ')+d.name;
  $('eu-add').textContent=mode==='ann'?'Add annotation':`Add ${mode==='reading'?'reading':'focus'} point`;
  $('eu-geometry').textContent=mode==='ann'?'Edit position & size':'Edit point position';
  const step=mode!=='ann'&&orderOf(d,mode).find(st=>st.id===selStep);
  $('eu-geometry').disabled=mode==='ann'?!(selArea()||selInst()):!step||!!step.instId;
  $('eu-capture').hidden=!isPage()||mode!=='ann';
  const origin=!isPage()&&page(d.sourcePageId||d.sourceScreenId);$('eu-source').hidden=!origin;
  if(origin){$('eu-source').textContent='← '+origin.name;$('eu-source').setAttribute('aria-label','Open source screen '+origin.name);$('eu-source').onclick=async()=>{await openDoc('page',origin.id);$('eu-doc-title').focus();};}
};

/* Keep tab roles, arrow navigation, and active-panel relationships consistent. */
const euOriginalTabs=renderTabs;
renderTabs=function(){
  euOriginalTabs();const live=tabs.filter(docOf);
  $('tabs').querySelectorAll('.tab').forEach((row,i)=>{
    row.removeAttribute('aria-selected');row.setAttribute('role','presentation');const button=row.querySelector('.go'),t=live[i];
    button.id='eu-tab-'+t.kind+'-'+t.id;button.tabIndex=t===current?0:-1;button.setAttribute('aria-controls','stageBox');
    button.onclick=async()=>{current=t;await activate();document.getElementById(button.id)?.focus();};
    row.querySelector('.x').onclick=()=>{closeTab(t);requestAnimationFrame(()=>$('tabs').querySelector('.go[aria-selected="true"]')?.focus());};
  });
  const active=$('tabs').querySelector('.go[aria-selected="true"]');
  $('stageBox').setAttribute('role','tabpanel');
  if(active)$('stageBox').setAttribute('aria-labelledby',active.id);else{$('stageBox').removeAttribute('aria-labelledby');$('stageBox').setAttribute('aria-label','Annotation workspace');}
};
$('tabs').addEventListener('keydown',async e=>{
  const choices=[...$('tabs').querySelectorAll('.go')],currentButton=e.target.closest('.tab')?.querySelector('.go'),i=choices.indexOf(currentButton);
  if(i<0)return;let next;
  if(e.key==='ArrowRight')next=(i+1)%choices.length;else if(e.key==='ArrowLeft')next=(i-1+choices.length)%choices.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=choices.length-1;else return;
  e.preventDefault();choices[next].click();
});
$('dlg').setAttribute('aria-labelledby','dlgTitle');$('dlg').setAttribute('aria-describedby','dlgMsg');
const euOriginalPicker=showPicker;
showPicker=function(...args){euOriginalPicker(...args);requestAnimationFrame(()=>$('pickerList').querySelector('input,button')?.focus());};
const euOriginalPickerTab=setPickerTab;
setPickerTab=function(tab){euOriginalPickerTab(tab);$('ptAnn').tabIndex=tab==='ann'?0:-1;$('ptComp').tabIndex=tab==='comp'?0:-1;$('pickerList').setAttribute('aria-labelledby',tab==='ann'?'ptAnn':'ptComp');};
$('picker').addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();hidePicker();$('eu-add')?.focus();}});

/* Optional review metadata is saved on the region, not on the shared tag type. */
const euOriginalDetail=renderDetail;
renderDetail=function(){
  euOriginalDetail();const d=doc(),a=mode==='ann'&&detail?.kind==='area'&&d?.areas.find(a=>a.id===detail.id),panel=$('details');
  if(!a||panel.hidden)return;
  const existing=panel.querySelector('.eu-review');if(existing?.dataset.area===a.id)return;
  existing?.remove();
  const section=document.createElement('section');section.className='eu-review';section.dataset.area=a.id;section.setAttribute('aria-label','Optional guidance and review');
  section.innerHTML='<h3>Guidance & review</h3><label class="eu-field">Guidance / note<textarea data-field="note" rows="3" maxlength="10000" placeholder="Context for the designer or developer"></textarea></label><div class="eu-review-grid"><label class="eu-field">Status<select data-field="status"><option>Open</option><option>In review</option><option>Resolved</option></select></label><label class="eu-field">Severity<select data-field="severity"><option>Guidance</option><option>Low</option><option>Medium</option><option>High</option></select></label></div><label class="eu-field">Owner<input data-field="owner" type="text" maxlength="200" placeholder="Person or team"></label><h4>Reference links</h4><ul class="eu-references"></ul><label class="eu-field">Add reference URL<input type="url" class="eu-reference-input" placeholder="https://…" maxlength="2000"></label><button type="button" class="small eu-reference-add">Add reference</button><p class="eu-reference-error" role="alert" hidden></p><p class="hint">Guidance and review fields save automatically.</p>';
  const defaults=EU.metadata(a);
  section.querySelectorAll('[data-field]').forEach(input=>{
    const key=input.dataset.field;input.value=defaults[key];let snapshot=null;
    input.onfocus=()=>{snapshot=serialize();};
    input.oninput=()=>{a[key]=input.value;scheduleSave();};
    input.onchange=()=>{a[key]=input.value;if(snapshot&&snapshot!==serialize())pushUndo(snapshot);snapshot=serialize();scheduleSave();syncButtons();};
  });
  const linkList=section.querySelector('.eu-references');
  const links=()=>{
    linkList.replaceChildren();(a.references||[]).forEach((value,i)=>{
      const safe=EU.safeReference(value);if(!safe)return;
      const li=document.createElement('li'),anchor=document.createElement('a'),remove=document.createElement('button');
      anchor.href=safe;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.textContent=safe;anchor.title=safe;
      remove.type='button';remove.className='icon del';remove.textContent='✕';remove.setAttribute('aria-label','Remove reference '+safe);
      remove.onclick=()=>{const before=serialize();a.references.splice(i,1);pushUndo(before);scheduleSave();syncButtons();links();section.querySelector('.eu-reference-input').focus();EU.announce('Reference removed.');};
      li.append(anchor,remove);linkList.append(li);
    });
  };links();
  const add=()=>{
    const input=section.querySelector('.eu-reference-input'),message=section.querySelector('.eu-reference-error'),safe=EU.safeReference(input.value.trim());
    if(!safe){message.hidden=false;message.textContent='Use a full https:// or http:// URL without a username or password.';input.setAttribute('aria-invalid','true');input.focus();return;}
    if((a.references||[]).length>=50){message.hidden=false;message.textContent='This annotation already has 50 references.';return;}
    message.hidden=true;input.removeAttribute('aria-invalid');const before=serialize();a.references=Array.from(new Set([...(a.references||[]),safe]));
    if(before!==serialize())pushUndo(before);scheduleSave();syncButtons();input.value='';links();input.focus();EU.announce('Reference saved.');
  };
  section.querySelector('.eu-reference-add').onclick=add;
  section.querySelector('.eu-reference-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add();}};
  panel.append(section);
};

/* Reordering an order list keeps focus on the moved item after its rerender. */
const euOriginalOrderPanel=renderOrderPanel;
renderOrderPanel=function(){
  euOriginalOrderPanel();const panel=$('details');
  panel.querySelectorAll('[data-up],[data-down],[data-del],[data-i]').forEach(button=>{
    const original=button.onclick;
    button.onclick=function(e){
      const start=Number(button.dataset.up??button.dataset.down??button.dataset.del??button.dataset.i);
      const destination=button.hasAttribute('data-up')?start-1:button.hasAttribute('data-down')?start+1:start;
      original?.call(button,e);
      requestAnimationFrame(()=>{const items=[...$('details').querySelectorAll('[data-i]')];(items[Math.min(Math.max(0,destination),items.length-1)]||$('eu-add')).focus();});
    };
  });
};
