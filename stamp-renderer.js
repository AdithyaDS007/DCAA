/* Exact Deque stamp artwork on the canvas; custom tags retain editable badges.
   Load after stamp-data.js and the editor/presentation fragments, before boot. */
(function installStampRenderer() {
  'use strict';
  const cache = new Map();
  let redrawQueued = false;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hex = value => {
    const s = String(value || '').trim().toLowerCase();
    return /^#[a-f\d]{3}$/i.test(s) ? '#' + [...s.slice(1)].map(c => c+c).join('') : /^#[a-f\d]{6}$/i.test(s) ? s : null;
  };
  const foreground = color => {
    const h = (hex(color) || '#2e5f7a').slice(1);
    const rgb = [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    const l = .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    return (l+.05)/.05 >= 1.05/(l+.05) ? '#000000' : '#ffffff';
  };
  function sourceFor(type) {
    if (!type) return null;
    const data = window.dcaaStampData, id = type.sourceStampId || data?.byTagId?.[type.id];
    const asset = id && data?.bySourceId?.[id];
    return asset && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.src || '') && asset.width > 0 && asset.height > 0 ? asset : null;
  }
  function resolve(type) {
    const asset = sourceFor(type); if (!asset) return null;
    const baseline = (window.dcaaLibraryData?.referenceTags || []).find(t => t.sourceStampId === asset.sourceStampId);
    const label = asset.label ?? baseline?.label ?? asset.title;
    const color = asset.color ?? baseline?.color;
    const border = asset.border ?? baseline?.border;
    if (String(type.label ?? '') !== String(label ?? '') || (color && hex(type.color) !== hex(color)) || (border && (type.border || 'solid') !== border)) return null;
    if (type.code !== undefined && String(type.code) !== String(asset.code)) return null;
    return asset;
  }
  function describe(type, area) {
    type = type || {label:'Annotation',color:'#2e5f7a'};
    const source = sourceFor(type), asset = resolve(type);
    const label = area && typeof badgeText === 'function' ? badgeText(area,type.id) : String(type.label || 'Annotation');
    const rawCode = String(type.code || source?.code || 'C');
    const code = rawCode === 'C' || rawCode.startsWith('#') ? rawCode : '#'+rawCode;
    return {typeId:type.id,asset,src:asset?.src || null,width:asset?.width,height:asset?.height,code,label,color:hex(type.color)||'#2e5f7a',foreground:foreground(type.color),border:type.border||'solid',sourceStampId:source?.sourceStampId};
  }
  function html(type, options = {}) {
    const info = describe(type, options.area), height = Math.max(16,Math.min(96,Number(options.height)||32));
    const accessible = options.decorative ? ' aria-hidden="true"' : ` role="img" aria-label="${escape(info.code+' '+info.label)}"`;
    if (info.asset) return `<img class="dcaa-stamp-image" src="${info.asset.src}" alt="${options.decorative?'':escape(info.code+' '+info.label)}" width="${Math.round(height*info.width/info.height)}" height="${height}" style="height:${height}px;width:auto;max-width:100%;object-fit:contain;vertical-align:middle"${options.decorative?' aria-hidden="true"':''}>`;
    return `<span class="dcaa-custom-stamp"${accessible} style="display:inline-flex;align-items:center;position:relative;min-height:${height}px;padding-right:9px;border-radius:4px;background:${info.color};color:${info.foreground};box-shadow:0 0 0 1px #fff,0 0 0 2px #193443;font:600 13px/1.2 Graphik,Inter,Arial,sans-serif"><span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;width:${height}px;height:${height}px;margin-right:6px;border:2px solid ${info.color};border-radius:50%;background:white;color:#193443">${escape(info.code)}</span><span aria-hidden="true">${escape(info.label)}</span></span>`;
  }
  function queueRedraw() {
    if (redrawQueued || typeof requestAnimationFrame !== 'function') return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      if (typeof doc === 'function' && doc() && typeof render === 'function') {
        // Do not replace a focused/hovered overlay control when its artwork loads.
        if (typeof redrawKeepingLabels === 'function') redrawKeepingLabels(); else render();
      }
    });
  }
  function load(asset) {
    if (!asset) return Promise.resolve(null);
    const cached = cache.get(asset.src); if (cached) return cached.promise;
    const entry = {image:null,failed:false,promise:null};
    entry.promise = new Promise(resolve => {
      const image = new Image();
      image.onload = () => { entry.image = image; queueRedraw(); resolve(image); };
      image.onerror = () => { entry.failed = true; resolve(null); };
      image.src = asset.src;
    });
    cache.set(asset.src,entry); return entry.promise;
  }
  function preload(selectedTypes) {
    const assets = selectedTypes ? selectedTypes.map(resolve).filter(Boolean) : Object.values(window.dcaaStampData?.bySourceId || {});
    return Promise.all(assets.map(load));
  }
  function roundRect(x,y,w,h,r) {
    r = Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }
  function numberBadge(number,x,y,height,s) {
    const radius = 11*s, cy = y+height/2;
    ctx.beginPath();ctx.arc(x+radius,cy,radius,0,Math.PI*2);ctx.fillStyle='#193443';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=s;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font=`600 ${12*s}px Graphik,Inter,Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(number+'.',x+radius,cy,19*s);ctx.textAlign='left';
  }
  function vectorBadge(info,x,y,width,height,fs,s) {
    const circle = Math.min(height,width), bodyX = x+circle*.45, bodyY = y+height*.12, bodyH = height*.76;
    // The white halo and dark edge keep even a user-selected white stamp visible.
    roundRect(bodyX,bodyY,Math.max(1,width-circle*.45),bodyH,3*s);
    ctx.fillStyle=info.color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3*s;ctx.stroke();ctx.strokeStyle='#193443';ctx.lineWidth=s;ctx.stroke();
    const r = circle/2-s, cx=x+circle/2,cy=y+height/2;
    ctx.beginPath();ctx.arc(cx,cy,Math.max(1,r),0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=4*s;ctx.stroke();ctx.strokeStyle='#193443';ctx.lineWidth=2*s;ctx.stroke();ctx.strokeStyle=info.color;ctx.lineWidth=s;ctx.stroke();
    ctx.font=`700 ${Math.min(12*s,fs)}px Graphik,Inter,Arial,sans-serif`;ctx.fillStyle='#193443';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(info.code,cx,cy,Math.max(1,circle-5*s));ctx.textAlign='left';
    ctx.font=`600 ${fs}px Graphik,Inter,Arial,sans-serif`;ctx.fillStyle=info.foreground;ctx.fillText(info.label,x+circle+5*s,cy,Math.max(1,width-circle-11*s));
  }
  function stampDrawLabels(list,lw,fs) {
    const d = doc(); if (!d || !list.length) return [];
    const s=lw/2,gap=4*s,rowH=32*s,maxWidth=d.w+view.padX*2;
    ctx.save();ctx.font=`600 ${fs}px Graphik,Inter,Arial,sans-serif`;
    const items=list.map(l=>({box:l.box,expand:true,segs:(l.segs||[{text:l.text,color:l.color}]).map((g,i)=>{
      if(!l.area)return {...g,component:true};
      const typeId=typesOf(l.area)[i],info=describe(typeById(typeId),l.area);
      if(info.asset)load(info.asset);
      return {...g,typeId,stamp:info,number:i===0?l.num:null};
    })}));
    const widthOf=(text,g)=>{
      if(!g?.stamp)return ctx.measureText(text).width+12*s;
      const prefix=g.number!=null?28*s:0,info=g.stamp;
      return Math.min(maxWidth,prefix+(info.asset?rowH*info.width/info.height:rowH+ctx.measureText(info.label).width+15*s));
    };
    const plan=planLabels(items,{measure:widthOf,pad:0,rowH,gap,minW:Math.min(180*s,maxWidth),maxRows:Infinity,bounds:{x0:-view.padX,y0:-view.padY,x1:d.w+view.padX,y1:d.h+view.padY}});
    plan.forEach(p=>{
      if(!p.leader)return;
      const L=p.leader,line=()=>{ctx.beginPath();ctx.moveTo(L.x1,L.y1);ctx.lineTo(L.x2,L.y2);ctx.stroke()};
      ctx.lineCap='round';ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=3*s;line();ctx.strokeStyle='#193443';ctx.lineWidth=s;line();ctx.fillStyle='#193443';ctx.beginPath();ctx.arc(L.x2,L.y2,2*s,0,Math.PI*2);ctx.fill();
    });
    plan.forEach(p=>p.rows.forEach((row,ri)=>{
      let x=p.r.x;const y=p.r.y+ri*(rowH+gap);
      row.items.forEach(i=>{
        const g=p.segs[i],width=p.widths[i],prefix=g.number!=null?28*s:0;
        if(g.number!=null)numberBadge(g.number,x,y,rowH,s);
        if(g.stamp){
          const info=g.stamp,image=info.asset&&cache.get(info.asset.src)?.image;
          if(image){const ratio=Math.min(rowH/info.height,Math.max(1,width-prefix)/info.width),h=info.height*ratio;ctx.drawImage(image,x+prefix,y+(rowH-h)/2,info.width*ratio,h)}
          else vectorBadge(info,x+prefix,y,Math.max(1,width-prefix),rowH,fs,s);
        }else{
          roundRect(x,y+3*s,width,rowH-6*s,3*s);ctx.fillStyle=hex(g.color)||'#193443';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2*s;ctx.stroke();ctx.strokeStyle='#193443';ctx.lineWidth=s;ctx.stroke();ctx.fillStyle=foreground(g.color);ctx.font=`600 ${fs}px Graphik,Inter,Arial,sans-serif`;ctx.textBaseline='middle';ctx.fillText(g.text,x+6*s,y+rowH/2,Math.max(1,width-12*s));
        }
        x+=width+gap;
      });
    }));
    ctx.restore();return plan.map(p=>p.r);
  }
  const api = window.dcaaStamps = {resolve,sourceFor,describe,html,preload,ready:()=>Promise.all([...cache.values()].map(e=>e.promise)),drawLabels:stampDrawLabels};
  if(window.DCAA_STAMPS_TEST_ONLY)return;
  drawLabels=stampDrawLabels;
  const overlay=renderOverlay;
  renderOverlay=function(labels){
    overlay(labels);
    if(keepOverlay)return;
    labels.forEach(l=>{
      if(!l.area)return;
      const button=[...$('overlay').querySelectorAll('[data-area]')].find(b=>b.dataset.area===l.area.id);if(!button)return;
      const names=typesOf(l.area).map(id=>{const info=describe(typeById(id),l.area);return info.code+' '+info.label});
      button.setAttribute('aria-label',`${l.num}. ${names.join('; ')}: show details`);
    });
  };
  // Preload the embedded asset set once. Drawing and PNG rendering use only this
  // synchronous cache; a first export waits for any newly selected stamp image.
  preload();
  const pngButton=$('exportPng'),pngExport=pngButton.onclick;
  pngButton.onclick=async function(event){
    if(!doc()||pngButton.dataset.stampBusy)return;
    pngButton.dataset.stampBusy='true';pngButton.disabled=true;
    try{await api.preload(types());await pngExport.call(this,event)}
    finally{delete pngButton.dataset.stampBusy;syncButtons()}
  };
})();
