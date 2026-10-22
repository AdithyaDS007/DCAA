/* Pure helpers shared by the report builder and its exported offline runtime. */
function stampReportEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function stampReportType(type, asset) {
  return {...type,stamp:asset?{src:asset.src,width:asset.width,height:asset.height,code:asset.code,title:asset.title}:null};
}
function stampReportInfo(type, text) {
  type=type||{};
  let color=String(type.color||'#2e5f7a');
  if(/^#[a-f\d]{3}$/i.test(color))color='#'+[...color.slice(1)].map(c=>c+c).join('');
  if(!/^#[a-f\d]{6}$/i.test(color))color='#2e5f7a';
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const l=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],foreground=(l+.05)/.05>=1.05/(l+.05)?'#000000':'#ffffff';
  const candidate=type.stamp;
  const asset=candidate&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(candidate.src||'')&&Number.isFinite(candidate.width)&&Number.isFinite(candidate.height)&&candidate.width>0&&candidate.height>0?candidate:null;
  const raw=String(type.code||asset?.code||'C'),code=raw==='C'||raw.startsWith('#')?raw:'#'+raw;
  const label=String(text??type.label??'Annotation');
  return {asset,code,label,color,foreground,accessible:code+' '+label};
}
function stampReportBadge(type,text,decorative=false) {
  const i=stampReportInfo(type,text),e=stampReportEscape;
  if(i.asset)return `<img class="rstamp-art" src="${i.asset.src}" width="${Math.round(32*i.asset.width/i.asset.height)}" height="32" alt="${decorative?'':e(i.accessible)}"${decorative?' aria-hidden="true"':''}>`;
  return `<span class="rstamp-custom" style="--stamp-color:${i.color};--stamp-fg:${i.foreground}"${decorative?' aria-hidden="true"':` role="img" aria-label="${e(i.accessible)}"`}><span class="rstamp-code" aria-hidden="true">${e(i.code)}</span><span class="rstamp-text" aria-hidden="true">${e(i.label)}</span></span>`;
}
function stampReportWidth(segment,measure,height=32,maxWidth=Infinity) {
  if(!segment?.stampType)return Math.ceil(measure.measureText(segment?.text||'').width)+12;
  const info=stampReportInfo(segment.stampType,segment.text),prefix=segment.number!=null?28:0;
  return Math.min(maxWidth,prefix+(info.asset?height*info.asset.width/info.asset.height:height+Math.ceil(measure.measureText(info.label).width)+15));
}
function stampReportLayout(plan) {
  return plan.rows.map((row,ri)=>`<span class="stamp-row" aria-hidden="true" style="top:${ri*36}px">${row.items.map(i=>{
    const g=plan.segs[i],number=g.number!=null?`<span class="stamp-number">${g.number}.</span>`:'';
    return `<span class="stamp-segment" style="width:${plan.widths[i]}px">${number}${stampReportBadge(g.stampType,g.text,true)}</span>`;
  }).join('')}</span>`).join('');
}
function stampReportRuntimeSource() {
  return [stampReportEscape,stampReportInfo,stampReportBadge,stampReportWidth,stampReportLayout].map(fn=>fn.toString()).join('\n');
}
const STAMP_REPORT_CSS=`
.rstamp-art{display:inline-block;vertical-align:middle;flex:0 1 auto;height:32px;width:auto;max-width:100%;object-fit:contain;object-position:left center}
.rstamp-custom,.lbl.multi .rstamp-custom{box-sizing:border-box;display:inline-flex;align-items:center;flex:0 1 auto;min-width:0;height:32px;padding:0 9px 0 0;border:0;border-radius:4px;background:var(--stamp-color)!important;color:var(--stamp-fg)!important;font:600 14px/1.2 Graphik,Inter,Arial,sans-serif;box-shadow:0 0 0 1px #fff,0 0 0 2px #193443;white-space:nowrap;vertical-align:middle}
.rstamp-code,.lbl.multi .rstamp-code{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;border:2px solid var(--stamp-color);border-radius:50%;margin-right:6px;padding:0;background:#fff!important;color:#193443!important;font:700 12px/1 Graphik,Inter,Arial,sans-serif;box-shadow:0 0 0 1px #193443}
.rstamp-text,.lbl.multi .rstamp-text{padding:0;border:0;background:transparent!important;color:inherit!important;overflow:hidden;text-overflow:ellipsis}
.lbl.multi.stamp-label{display:block;position:absolute;line-height:1;box-shadow:none;background:transparent!important;border:0;padding:0;text-align:left}
.lbl.multi.stamp-label>.stamp-row{display:flex;align-items:center;position:absolute;left:0;gap:4px;height:32px;white-space:nowrap;background:transparent!important;border:0;padding:0;box-shadow:none;color:inherit!important}
.lbl.multi .stamp-segment{display:inline-flex;align-items:center;gap:6px;flex:none;height:32px;min-width:0;background:transparent!important;border:0;padding:0;box-shadow:none}
.lbl.multi .stamp-number{display:inline-flex;align-items:center;justify-content:center;flex:0 0 22px;width:22px;height:22px;border:1px solid #fff;border-radius:50%;padding:0;background:#193443!important;color:#fff!important;font:600 12px/1 Graphik,Inter,Arial,sans-serif;box-shadow:0 0 0 1px #193443}
.lbl.multi.stamp-label[aria-expanded=true]{outline:2px solid #193443;outline-offset:3px}.lbl.multi.stamp-label:focus-visible{outline:3px solid #193443;outline-offset:4px}
.complete-report h5 .rstamp-art{max-width:100%;height:32px}.complete-report h5{margin:16px 0 10px}.dType .rstamp-art{max-width:100%}
@media print{.rstamp-art,.rstamp-custom,.rstamp-code,.stamp-number{-webkit-print-color-adjust:exact;print-color-adjust:exact}.rstamp-art{max-height:none;max-width:100%;height:32px}.rstamp-custom{font-size:12pt}}
`;
