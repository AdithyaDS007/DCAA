"""Report stamp transformations; call after base replacements, before fragments."""

def upgrade_stamps(html):
    def replace(old, new, count=1):
        nonlocal html
        found = html.count(old)
        if found != count:
            raise ValueError(f'Stamp report: expected {count} matches, found {found}: {old[:100]!r}')
        html = html.replace(old, new)

    # Existing renderer callbacks ignore the optional segment argument.
    if 'o.measure(g.text)' in html:
        replace('o.measure(g.text)', 'o.measure(g.text, g)')
    else:
        assert 'o.measure(g.text, g)' in html or 'o.measure(g.text,g)' in html, 'Missing shared segment measurement'
    replace('types: types().map(t => ({ ...t, groupName: groupName(t.group) })),',
            'types: types().map(t => ({ ...stampReportType(t, window.dcaaStamps?.resolve(t)), groupName: groupName(t.group) })),')
    replace('${REPORT_CSS}${DCAA_REPORT_CSS}</style></head>', '${REPORT_CSS}${DCAA_REPORT_CSS}${STAMP_REPORT_CSS}</style></head>')
    replace(r'<script>${planLabels.toString()}<\/script>', r'<script>${stampReportRuntimeSource()}\n${planLabels.toString()}<\/script>')
    replace('expand: l.n !== undefined && l.n === active', 'expand: true')
    replace('measure: t => Math.ceil(measure.measureText(t).width), pad: 14, rowH: 22, gap: 2, minW: 180',
            'measure: (text, segment) => stampReportWidth(segment, measure, 32, W), pad: 0, rowH: 32, gap: 4, minW: Math.min(180, W)')
    replace('measure.font = \'600 14px system-ui, -apple-system, sans-serif\';', "measure.font = '600 14px Graphik, Inter, Arial, sans-serif';")
    replace('const segs = tys(a).map((id, k) => ({ text: k ? badge(a, id) : `${n + 1}. ${badge(a, id)}`, color: typeOf(id).color }));',
            'const segs = tys(a).map((id, k) => ({ text: badge(a, id), color: typeOf(id).color, typeId:id, stampType:typeOf(id), number:k===0?n+1:null }));')
    replace('aria: `${n + 1}. ${tLabel(a)}`', "aria: `${n + 1}. ${tys(a).map(id=>stampReportInfo(typeOf(id),badge(a,id)).accessible).join('; ')}`")
    replace('''<button class="lbl multi" style="left:${r.x}px;top:${r.y}px;width:${r.w + 1}px" data-n="${l.n}" aria-expanded="${active === l.n}" aria-controls="det" aria-label="${esc(l.aria)}">${l.segs.map(g => `<span style="--c:${g.color}">${esc(g.text)}</span>`).join('')}</button>''',
            '''<button class="lbl multi stamp-label" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px" data-n="${l.n}" aria-expanded="${active === l.n}" aria-controls="det" aria-label="${esc(l.aria)}">${stampReportLayout(plan[i])}</button>''')
    # Each detailed guidance section exposes the same original/custom artwork.
    replace('''${multi ? `<h3 class="dtH"><i class="sw" style="--c:${x.color}" aria-hidden="true"></i>${esc(x.label)}</h3><span class="hint">${meta(x)}</span>` : ''}''',
            '''${multi ? `<h3 class="dtH">${esc(x.label)}</h3><span class="hint">${meta(x)}</span>` : ''}<div class="report-stamp-preview">${stampReportBadge(x,badge(a,id))}</div>''')
    return html
