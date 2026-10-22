from pathlib import Path
import base64, json, re

root = Path(__file__).resolve().parent
brand = root / 'brand' if (root / 'brand').is_dir() else root.parent / 'dcaa-studio' / 'public' / 'brand'
def data(path, mime):
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()
html = (root / 'original.html').read_text(encoding='utf-8')
def replace(old, new, count=1):
    global html
    if html.count(old) != count:
        raise ValueError(f'Expected {count} matches: {old[:100]!r}; found {html.count(old)}')
    html = html.replace(old, new)

replace('<title>DCAA</title>', '<title>Deque DCAA Studio — Image annotation</title>')
replace("  try { curImg = await getImg(d.imageId); }\n  catch (e) { curImg = null; } // image missing or unreadable: show the tab without it rather than a stale canvas\n  if (current !== want) return; // switched again while loading\n  activating = null; curImgFor = d;", "  let loadedImage = null;\n  try { loadedImage = await getImg(d.imageId); }\n  catch (e) { /* Keep this document image empty if decoding fails. */ }\n  if (current !== want || doc() !== d) return; // Ignore an earlier screen/project decode.\n  curImg = loadedImage; activating = null; curImgFor = d;")
replace('<body>\n<header>', '<body>\n<a class="skip-link" href="#center">Skip to annotation workspace</a>\n<header class="studio-header">')
replace('  <h1>DCAA</h1>', '''  <img class="brand-logo" src="''' + data(brand / 'deque-logo.svg','image/svg+xml') + '''" alt="Deque">
  <div class="brand-title"><h1>DCAA Studio</h1><span>Image annotation workspace</span></div>
  <div class="header-actions"><div class="save-state"><span id="saveStatus" role="status" aria-live="polite" aria-atomic="true">Opening local workspace…</span><button id="retrySave" class="small" hidden>Retry save</button><button id="saveBackup" class="small" hidden>Save backup</button></div>
  <button id="helpBtn" class="small">Help</button><button id="headerReport" class="small" disabled>Customer report</button><button id="headerUpload" class="primary">＋ Add screens</button></div>''')
replace('<main>\n  <nav', '<main id="workspace">\n  <nav')
replace('<div id="center">', '<div id="center" tabindex="-1">')
replace('<div id="drop">Drop screenshots here, paste one (Ctrl/⌘+V), or use <strong>+</strong> next to Screens. Each image becomes a screen.<br><br>Drag on the image to draw an area, then choose an annotation or a component.</div>', '''<div id="drop"><span class="empty-icon" aria-hidden="true">▧</span><h2>Start with a design screenshot</h2><p>Drop images here, paste a screenshot, or add screens to begin.</p><button class="primary" id="emptyUpload">Add your first screen</button><ol class="quick-steps"><li><strong>01</strong><span>Draw a region<br><small>Choose a semantic tag</small></span></li><li><strong>02</strong><span>Reuse components<br><small>Annotate shared patterns once</small></span></li><li><strong>03</strong><span>Share guidance<br><small>Export a complete review</small></span></li></ol><p class="local-note">Saved in this browser · Portable project backups · AI disconnected</p></div>''')
replace('<button value="ok" class="primary">Download report</button>', '<button value="ok" class="primary">Prepare HTML report</button>')
replace('<dialog id="dlg">', '<dialog id="dlg" aria-labelledby="dlgTitle" aria-describedby="dlgMsg">')
replace('The annotations offered in the pop-up, grouped by category. Names, descriptions, WCAG criteria and border styles come from the <strong>a11y-png-annotation</strong> skill; the Images group follows its 1.1.1 guidance. Set each annotation\'s colour and border style here. Changes are saved with the project.', 'Manage the labels you use on designs. Customize colors, border patterns, guidance, properties, and platform coverage. Add the Deque reference collection or connect tags to official WCAG criteria. Changes are saved with this project.')
# Apply approved base colors only to shipped defaults. Imported custom colors stay untouched.
colors = {'#f6f7f9':'#f6f3ed','#1d2330':'#2a2826','#5b6475':'#193443','#d9dde5':'#c5dde9','#2557d6':'#2e5f7a','#c62828':'#6c251f','#e9ecf1':'#f6f3ed','#7b3fe4':'#2e5f7a','#1d4ed8':'#2e5f7a','#b42318':'#6c251f','#1f5fd1':'#193443','#0277bd':'#67a0ba','#23699c':'#2e5f7a','#3d6e9e':'#193443','#077a4d':'#cc463b','#00796b':'#6c251f','#2e7d32':'#e06f65','#4a7a28':'#f0b7b2','#a35400':'#f3a326','#9a3412':'#b25295','#6d5a52':'#5f2c50','#c2410c':'#dd94ca','#616161':'#2a2826'}
for old, new in colors.items(): html = html.replace(old,new)
replace("ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(g.text, bx + pad, by + rowH / 2);", "ctx.fillStyle = tagForeground(g.color); ctx.textBaseline = 'middle'; ctx.fillText(g.text, bx + pad, by + rowH / 2);")
html = html.replace('600 ${fs}px system-ui, sans-serif', '500 ${fs}px Inter, Arial, sans-serif')
replace('function downloadReport() {', 'function buildCustomerReport() {')
replace("note: a.note || '' });", "note: a.note || '', status:a.status||'Open', severity:a.severity||'Guidance', owner:a.owner||'', references:a.references||[], wcagVersion:window.dcaaLibrary?.versionFor(a)||a.wcagVersion||'2.2', platform:window.dcaaLibrary?.platformFor(a)||a.platform||'Web' });")
replace("logo: r.logoId ? images[r.logoId] : null,", "logo: r.logoId ? images[r.logoId] : DCAA_BRAND_LOGO,\n    rules: window.dcaaLibrary?.rules||[], version:window.dcaaLibrary?.versionFor()||'2.2', platform:project.libraryPreferences?.platform==='all'?'All platforms':project.libraryPreferences?.platform||'All platforms',")
replace("orders: { reading: orderJson(c, 'reading'), focus: orderJson(c, 'focus') } })),", "orders: { reading: orderJson(c, 'reading'), focus: orderJson(c, 'focus') }, sourceScreenId:c.sourcePageId||c.sourceScreenId, sourceRegion:c.sourceRegion })),")
replace("note: a.note, ...rect(a) }; };", "note: a.note, status:a.status||'Open', severity:a.severity||'Guidance', owner:a.owner||'', references:a.references||[], wcagVersion:window.dcaaLibrary?.versionFor(a)||a.wcagVersion||'2.2', platform:window.dcaaLibrary?.platformFor(a)||a.platform||'Web', ...rect(a) }; };")
# The selected annotation can use a different WCAG version from the project.
# Keep its visible heading and the exported runtime's link resolver in sync.
replace("const t = typeOf(a.type), ids = tys(a), multi = ids.length > 1;", "const t = typeOf(a.type), ids = tys(a), multi = ids.length > 1;\n    const wcagVersion = ['2.1','2.2'].includes(a.wcagVersion) ? a.wcagVersion : D.version === '2.1' ? '2.1' : '2.2';\n    det.dataset.wcagVersion = wcagVersion;")
replace('''${x.wcag ? `<div style="margin-top:8px"><span class="hint">WCAG 2.2</span><div class="chips">''', '''${x.wcag ? `<div style="margin-top:8px" data-wcag-version="${wcagVersion}"><span class="hint">WCAG ${wcagVersion}</span><div class="chips">''')
replace(r'x.wcag.split(/[;,]\s*/).filter(Boolean)', r'x.wcag.split(/[;,\n]+/).map(value=>value.trim()).filter(Boolean)')
replace('<main id="pSum" role="tabpanel"', '<main id="reportContent"><div id="pSum" role="tabpanel"')
replace('</main>\n\n<div id="pDet"', '</div>\n\n<div id="pDet"')
replace('aria-label="Open component ${esc(l.comp.name)}"', 'aria-label="${esc(l.text)} — open component"')
replace('${REPORT_CSS}</style></head>', '${REPORT_CSS}${DCAA_REPORT_CSS}</style></head>')
replace('<script>window.REPORT_DATA=${json};<\\/script>', '${reportAppendix(data)}</main>\n<script>window.REPORT_DATA=${json};<\\/script>')
replace('<script>(${reportRuntime.toString()})();<\\/script>', '<script>${tagForeground.toString()}\n(${reportEnhanceRuntime.toString()})();<\\/script>\n<script>(${reportRuntime.toString()})();<\\/script>')
replace("  download(URL.createObjectURL(new Blob([html], { type: 'text/html' })), `${fileName(data.meta.title)}.html`);", '  return html;')
replace('o.measure(g.text) + o.pad','o.measure(g.text, g) + o.pad')
if (root/'stamp_build.py').exists():
    from stamp_build import upgrade_stamps
    html = upgrade_stamps(html)
# Headings of static appendix and linked WCAG metadata survive print and work offline.
replace('refresh();\nloadSaved().then(b => { if (b?.project?.pages?.length) loadBundle(b); });', '/* Upgrade fragments and controlled startup are inserted below. */')
font_css = '@font-face{font-family:Inter;src:url("' + data(brand/'inter-latin.woff2','font/woff2') + '") format("woff2");font-weight:100 900;font-display:swap}\n'
font_css += '/* Inter font license: ' + (brand/'Inter-OFL.txt').read_text(encoding='utf-8').replace('*/','* /').replace('`',"'").replace('${','$ {') + ' */\n'
css = font_css
for name in ['presentation-upgrade.css','editor-upgrade.css','library-upgrade.css','stamp-ui.css','project-hub.css']:
    if (root/name).exists(): css += (root/name).read_text(encoding='utf-8') + '\n'
replace('</style>\n</head>', css + '\n</style>\n</head>')
scripts = 'const DCAA_BRAND_LOGO=' + json.dumps(data(brand/'deque-logo.png','image/png')) + ';\n'
for name in ['data-upgrade.js','editor-upgrade.js','library-data.js','library-upgrade.js','presentation-upgrade.js','stamp-data.js','stamp-report.js','stamp-renderer.js','stamp-ui.js','project-hub.js']:
    if (root/name).exists(): scripts += '\n/* '+name+' */\n' + (root/name).read_text(encoding='utf-8').replace('/* REPORT_FONT */',font_css) + '\n'
scripts += "\nrefresh();\nif(window.dcaaData)window.dcaaData.start();\n"
replace('\n</script>\n</body>', '\n'+scripts.replace('</script','<\\/script')+'\n</script>\n</body>')
html = html.replace('</head>', '<!-- Embedded Inter font license\n' + (brand/'Inter-OFL.txt').read_text(encoding='utf-8').replace('--','—') + '\n-->\n</head>', 1)
(root/'index.html').write_text(html,encoding='utf-8')
print(f'Built standalone HTML: {len(html.encode("utf-8")):,} bytes')
