/* Browser-local project home. Install after the data, library, and presentation layers. */
(() => {
  'use strict';
  const api = window.dcaaData; if (!api) return;
  let dialog, list, feedback, createForm, renameForm, busy = false, opener, refreshToken = 0, listTimer;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action, className = '') => { const node = make('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; };
  function message(text = '', error = false) { feedback.textContent = text; feedback.setAttribute('role', error ? 'alert' : 'status'); feedback.hidden = !text; }
  function setBusy(value) {
    busy = value; dialog.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll('button,input').forEach(node => { node.disabled = value; });
  }
  async function perform(action, focusAfter) {
    if (busy) return; const previousFocus = document.activeElement;
    dialog.querySelector('#projectHubTitle').focus(); setBusy(true); message('Saving project…');
    try { await action(); } catch (error) { message(error.message || 'The project operation could not be completed. Your work is still available in the editor.', true); }
    finally {
      setBusy(false);
      if (dialog.open) { const target = focusAfter?.() || (previousFocus?.isConnected && dialog.contains(previousFocus) ? previousFocus : dialog.querySelector('#projectHubClose')); target?.focus(); }
    }
  }
  function dateText(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  function field(form, title, name, max, required = false) {
    const label = make('label', 'project-hub-field'), input = make('input'); input.type = 'text'; input.name = name; input.maxLength = max; input.required = required;
    label.append(make('span', '', title), input); form.append(label); return input;
  }
  function closeHome() { if (busy) return; dialog.close(); }
  function showRename(item) {
    renameForm.hidden = false; renameForm.dataset.projectId = item.id;
    renameForm.elements.namedItem('name').value = item.name;
    renameForm.elements.namedItem('customer').value = item.customer || '';
    renameForm.querySelector('h3').textContent = `Rename ${item.name}`;
    renameForm.elements.namedItem('name').focus();
    renameForm.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
  async function renderProjects() {
    const token = ++refreshToken, items = await api.listProjects(); if (token !== refreshToken) return;
    const active = api.currentProject(), focused = document.activeElement;
    const focusedId = focused?.closest?.('[data-project-id]')?.dataset.projectId, focusedAction = focused?.dataset.projectAction;
    list.replaceChildren();
    const count = dialog.querySelector('#projectHubCount'); count.textContent = `${items.length} saved project${items.length === 1 ? '' : 's'}`;
    if (!items.length) { list.append(make('p', 'project-hub-empty', 'No saved projects yet. Create a project above to get started.')); return; }
    for (const item of items) {
      const card = make('article', 'project-card'), preview = make('div', 'project-card-preview'); card.dataset.projectId = item.id;
      if (typeof item.thumbnail === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.thumbnail) && item.thumbnail.length < 160000) {
        const img = make('img'); img.src = item.thumbnail; img.alt = ''; img.loading = 'lazy'; preview.append(img);
      } else { const icon = make('span', '', '▧'); icon.setAttribute('aria-hidden', 'true'); preview.append(icon); }
      const content = make('div', 'project-card-content'), heading = make('h3', '', item.name);
      content.append(heading);
      if (item.id === active.id) content.append(make('span', 'project-card-active', 'Current project'));
      content.append(make('p', 'project-card-customer', item.customer || 'No customer specified'));
      content.append(make('p', 'project-card-counts', `${item.screenCount} screens · ${item.annotationCount} annotations · ${item.componentCount} components`));
      const time = make('time', 'project-card-time', `Updated ${dateText(item.updatedAt)}`); if (!Number.isNaN(new Date(item.updatedAt).valueOf())) time.dateTime = item.updatedAt; content.append(time);
      const actions = make('div', 'project-card-actions');
      actions.append(button(item.id === active.id ? 'Continue editing' : 'Open project', () => perform(async () => { await api.openProject(item.id); message(''); dialog.close(); }), 'primary'),
        button('Rename', () => showRename(item)), button('Duplicate', () => perform(async () => { const copy = await api.duplicateProject(item.id); await renderProjects(); message(`Created “${copy.name}”. Open it to begin editing.`); })));
      [...actions.children].forEach((node, index) => { node.setAttribute('aria-label', `${node.textContent}: ${item.name}`); node.dataset.projectAction = String(index); });
      content.append(actions); card.append(preview, content); list.append(card);
    }
    if (focusedId && focusedAction !== undefined && dialog.open) {
      const card = [...list.children].find(node => node.dataset.projectId === focusedId);
      const replacement = card && [...card.querySelectorAll('button')].find(node => node.dataset.projectAction === focusedAction); replacement?.focus();
    }
  }
  function setup() {
    if (dialog) return;
    dialog = make('dialog', 'project-hub'); dialog.id = 'projectHub'; dialog.setAttribute('aria-labelledby', 'projectHubTitle'); dialog.setAttribute('aria-describedby', 'projectHubDescription');
    const header = make('div', 'project-hub-header'), titleWrap = make('div'), eyebrow = make('p', 'project-hub-eyebrow', 'DCAA STUDIO');
    const title = make('h2', '', 'Your projects'); title.id = 'projectHubTitle'; title.tabIndex = -1;
    const desc = make('p', '', 'Create a workspace for each customer or design review. Your screens, annotations, notes, and shared components stay together.'); desc.id = 'projectHubDescription';
    titleWrap.append(eyebrow, title, desc); const close = button('Back to editor', closeHome, 'project-hub-close'); close.id = 'projectHubClose'; header.append(titleWrap, close);
    const location = make('div', 'project-hub-location'); location.append(make('strong', '', 'Saved in this browser on this device.'), make('span', '', 'Projects are not synced to an account. Use Save project or Save backup to keep a portable JSON copy. Browser data clearing can remove local projects.'));
    feedback = make('p', 'project-hub-feedback'); feedback.hidden = true; feedback.setAttribute('aria-live', 'polite'); feedback.setAttribute('aria-atomic', 'true');
    createForm = make('form', 'project-hub-form'); createForm.setAttribute('aria-labelledby', 'projectHubCreateTitle');
    const createTitle = make('h3', '', 'Create a project'); createTitle.id = 'projectHubCreateTitle'; createForm.append(createTitle);
    field(createForm, 'Project name', 'name', 200, true); field(createForm, 'Customer (optional)', 'customer', 500);
    const create = make('button', 'primary', 'Create project'); create.type = 'submit'; createForm.append(create);
    createForm.addEventListener('submit', event => { event.preventDefault(); if (!createForm.reportValidity()) return; void perform(async () => {
      await api.createProject(createForm.elements.namedItem('name').value, createForm.elements.namedItem('customer').value); createForm.reset(); message(''); dialog.close();
    }); });
    renameForm = make('form', 'project-hub-form project-hub-rename'); renameForm.hidden = true; renameForm.setAttribute('aria-labelledby', 'projectHubRenameTitle');
    const renameTitle = make('h3', '', 'Rename project'); renameTitle.id = 'projectHubRenameTitle'; renameForm.append(renameTitle);
    field(renameForm, 'Project name', 'name', 200, true); field(renameForm, 'Customer (optional)', 'customer', 500);
    const rename = make('button', 'primary', 'Save name'); rename.type = 'submit'; renameForm.append(rename, button('Cancel', () => { renameForm.hidden = true; createForm.elements.namedItem('name').focus(); }));
    renameForm.addEventListener('submit', event => { event.preventDefault(); if (!renameForm.reportValidity()) return; void perform(async () => {
      await api.renameProject(renameForm.dataset.projectId, renameForm.elements.namedItem('name').value, renameForm.elements.namedItem('customer').value); renameForm.hidden = true; await renderProjects(); message('Project details saved.');
    }, () => createForm.elements.namedItem('name')); });
    const listHeading = make('div', 'project-hub-list-heading'), count = make('h3', '', 'Saved projects'); count.id = 'projectHubCount';
    const listActions = make('div', 'project-hub-list-actions');
    listActions.append(button('Open project backup', () => { if (busy) return; dialog.close(); document.getElementById('openProject').click(); }),
      button('Refresh projects', () => perform(async () => { await renderProjects(); message('Project list refreshed.'); })));
    listHeading.append(count, listActions);
    list = make('div', 'project-hub-grid'); dialog.append(header, location, feedback, createForm, renameForm, listHeading, list); document.body.append(dialog);
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { renameForm.hidden = true; const target = opener?.isConnected && opener !== document.body && !dialog.contains(opener) ? opener : document.getElementById('projectsHome'); target?.focus(); });
    const entry = button('Projects', () => void openHome(), 'project-home-entry'); entry.id = 'projectsHome'; entry.setAttribute('aria-haspopup', 'dialog');
    const actions = document.querySelector('.header-actions'); (actions || document.querySelector('header') || document.body).prepend(entry);
  }
  async function openHome() {
    setup(); opener = document.activeElement; if (!dialog.open) dialog.showModal();
    dialog.querySelector('#projectHubTitle').focus();
    await perform(async () => {
      // Preserve the existing workspace as the first project before offering a switch.
      try { await api.saveCurrentProject(); message(''); } catch (error) { message(error.message, true); }
      await renderProjects();
    }, () => createForm.elements.namedItem('name'));
  }
  window.addEventListener('dcaa:projects-changed', () => {
    if (!dialog?.open || busy) return;
    clearTimeout(listTimer); listTimer = setTimeout(() => renderProjects().catch(error => message(error.message, true)), 100);
  });
  const start = api.start; api.start = async function (...args) { await start.apply(this, args); await openHome(); };
  window.dcaaProjects = { open: openHome, refresh: renderProjects };
})();
