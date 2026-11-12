(function(){
'use strict';
const TYPE_CN={master_disciple:'师徒',other:'代拉/引保代等',kin:'亲属',marriage:'姻缘',partner:'固定搭档'};
const LIYUAN_XO={p0226:'侯宝林',p0189:'常宝堃',p1688:'李福胜',p1241:'杨健',p1716:'王雅兰',p0807:'马贵荣',p0223:'高元钧',p1806:'常贵德'};
const CONF_CN={documented:'确定',disputed:'存疑'};
const GEN_COLORS=['#7f1d1d','#0ea5e9','#f59e0b','#3730a3','#22c55e','#db2777','#0f766e','#f97316','#7c3aed','#a3e635'];
const genColor=g=>g?GEN_COLORS[(g-1)%GEN_COLORS.length]:'#9ca3af';
const STRIPE='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="white" stroke-opacity="0.85" stroke-width="3.5" stroke-linecap="square"/></svg>');
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let P=[],R=[],L={},byId={},cy=null,state={mode:'network',focus:null,treeVariant:'era'};
let home={},spread={},layoutT=0,spreadReady=false,layoutLock=false,layoutAnim=0,placing=false;
let anchorId=null,anchorPt=null,lastPointer=null;
const Z_LO=0.42,Z_HI=1.2;
const adj={};
const Z_MIN=0.03,Z_MAX=32;
let zoomFromSlider=false;

let SPREAD={};
let NEBULA={};
Promise.all(['data/people.json','data/relations.json','data/layout.json','data/layout-spread.json','data/layout-nebula.json'].map(u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u);return r.json()})))
.then(([p,r,l,s,n])=>{P=p;R=r;L=l;SPREAD=s;NEBULA=n;init();}).catch(e=>{$('#cy').innerHTML='<p style="padding:20px">数据加载失败：'+esc(e.message)+'</p>';});

function labelOf(p){
  // disambiguate homonyms by master
  if(p._label) return p._label;
  return p.name;
}
function init(){
  P.forEach(p=>{byId[p.id]=p;adj[p.id]=[];});
  R.forEach(r=>{adj[r.from].push(r);adj[r.to].push(r);});
  const cnt={};P.forEach(p=>cnt[p.name]=(cnt[p.name]||0)+1);
  P.forEach(p=>{p._deg=adj[p.id].length;
    p._linked=p._deg>0;
    if(cnt[p.name]>1){const m=adj[p.id].find(r=>r.type==='master_disciple'&&r.to===p.id);p._label=p.name+(m?'（'+byId[m.from].name+'徒）':p.generation?'（第'+p.generation+'代）':'（同名）');}
    p._search=[p.name].concat(p.aliases||[]).join(' ');
  });
  const gens=[...new Set(P.map(p=>p.generation).filter(Boolean))].sort((a,b)=>a-b);
  const gmin=$('#gmin'),gmax=$('#gmax'),pgen=$('#pgen');
  gens.forEach(g=>{gmin.add(new Option(g,g));gmax.add(new Option(g,g));pgen.add(new Option('第'+g+'代',g));});
  gmin.value=gens[0];gmax.value=gens[gens.length-1];
  const sw=g=>'<span class="gen-swatch'+(g%2===0?' stripe':'')+'" style="background-color:'+genColor(g)+'"></span>'+g;
  $('#genLegend').innerHTML='代数：'+gens.map(sw).join('')+(P.some(p=>!p.generation)?'<span class="gen-swatch" style="background-color:#9ca3af"></span>不详':'');
  buildCy();
  bindUI();
  renderTables();
  renderSources();
  route();
  window.addEventListener('hashchange',route);
}

function edgeData(r){
  return {data:{id:r.id,source:r.from,target:r.to,type:r.type,conf:r.confidence,detail:r.detail}};
}
function nodeData(p){
  const size=Math.max(12,Math.min(70,10+Math.sqrt(p._deg)*6));
  return {data:{id:p.id,label:labelOf(p),gen:p.generation||0,color:p.role==='relative'?'#c7c7c7':genColor(p.generation),size:size,deg:p._deg,role:p.role},position:L[p.id]?{x:L[p.id][0],y:L[p.id][1]}:undefined};
}
function buildCy(){
  cy=cytoscape({container:$('#cy'),wheelSensitivity:0.25,minZoom:Z_MIN,maxZoom:Z_MAX,textureOnViewport:true,hideEdgesOnViewport:false,
    style:[
      {selector:'node',style:{'background-color':'data(color)','width':'data(size)','height':'data(size)','label':'data(label)','font-size':12,'color':'#222','text-valign':'bottom','text-margin-y':3,'text-outline-color':'#fff','text-outline-width':2,'min-zoomed-font-size':9,'border-width':1,'border-color':'#fff'}},
      {selector:'node[deg < 6]',style:{'font-size':10,'min-zoomed-font-size':11}},
      {selector:'node[deg >= 15]',style:{'font-size':16,'font-weight':'bold','min-zoomed-font-size':4}},
      {selector:'node[role = "relative"]',style:{'shape':'round-rectangle'}},
      {selector:'node[gen = 2], node[gen = 4], node[gen = 6], node[gen = 8], node[gen = 10]',style:{'background-image':STRIPE,'background-fit':'none','background-repeat':'repeat','background-width':8,'background-height':8,'background-clip':'node','background-position-x':'0','background-position-y':'0'}},
      {selector:'edge',style:{'width':1.5,'line-color':'#6b7280','curve-style':'straight','opacity':0.85,'target-arrow-shape':'none','line-style':'solid'}},
      {selector:'edge[type = "master_disciple"]',style:{'curve-style':'straight','target-arrow-shape':'triangle','target-arrow-color':'#374151','line-color':'#374151','line-style':'solid','width':1.6,'arrow-scale':0.8,'opacity':0.9}},
      {selector:'edge[type = "master_disciple"][conf = "documented"]',style:{'line-color':'#374151','target-arrow-color':'#374151','target-arrow-shape':'triangle','line-style':'solid','width':1.6,'opacity':0.92}},
      {selector:'edge[type = "master_disciple"][conf = "disputed"]',style:{'line-color':'#9ca3af','target-arrow-color':'#9ca3af','target-arrow-shape':'triangle','line-style':'dashed','line-dash-pattern':[10,6],'width':1.5,'opacity':0.8,'arrow-scale':0.75}},
      {selector:'edge[type = "kin"]',style:{'line-color':'#6b7280','line-style':'dashed','line-dash-pattern':[2,5],'width':1.6,'target-arrow-shape':'none','opacity':0.85}},
      {selector:'edge[type = "marriage"]',style:{'line-color':'#8e44ad','line-style':'dashed','line-dash-pattern':[2,5],'width':2,'target-arrow-shape':'none','opacity':0.9}},
      {selector:'edge[type = "other"]',style:{'line-color':'#0f766e','line-style':'dashed','line-dash-pattern':[8,3,2,3],'width':1.7,'target-arrow-shape':'none','opacity':0.8}},
      {selector:'edge[type = "partner"]',style:{'line-color':'#e11d48','target-arrow-shape':'none','line-style':'dashed','line-dash-pattern':[14,5,3,5],'width':2.6,'opacity':0.95,'curve-style':'straight'}},
      {selector:'.faded',style:{'opacity':0.07,'text-opacity':0}},
      {selector:'node.hl',style:{'border-width':3,'border-color':'#111','min-zoomed-font-size':0,'z-index':10}},
      {selector:'node.nb',style:{'min-zoomed-font-size':0,'z-index':9}},
      {selector:'edge.hl',style:{'opacity':1,'width':2.6,'z-index':9}},
      {selector:'.alllabels',style:{'min-zoomed-font-size':0}},
      {selector:'node.local',style:{'min-zoomed-font-size':0,'text-opacity':1}},
      {selector:'node.nebula',style:{'font-size':14,'min-zoomed-font-size':10,'text-outline-width':3,'text-outline-color':'#fff'}},
      {selector:'node.nebula[deg >= 8]',style:{'font-size':30,'min-zoomed-font-size':6,'font-weight':'bold'}},
      {selector:'node.nebula[deg >= 15]',style:{'font-size':42,'min-zoomed-font-size':4,'font-weight':'bold'}},
      {selector:'node.tree',style:{'shape':'ellipse','width':28,'height':28,'font-size':13,'min-zoomed-font-size':7,'text-valign':'bottom','text-halign':'center','text-margin-y':4,'color':'#1c1917','text-wrap':'wrap','text-max-width':'data(labelW)','background-color':'#fff','background-image':'none','border-width':3,'border-color':'data(eraColor)','padding':0}},
      {selector:'node.tree.est',style:{'color':'#78716c','border-style':'dashed','background-color':'#fafaf9'}},
      {selector:'node.tree.axis',style:{'shape':'ellipse','width':1,'height':1,'background-opacity':0,'border-width':0,'font-size':13,'font-weight':'bold','color':'#7c2d12','text-valign':'center','text-halign':'center','text-margin-y':0,'text-max-width':240,'z-index':0}},
      {selector:'edge.extra',style:{'width':1,'line-color':'#d6d3d1','target-arrow-color':'#d6d3d1','opacity':0.55,'line-style':'dashed','line-dash-pattern':[3,4],'z-index':0}},
      {selector:'edge.tree-link',style:{'width':5,'line-color':'#b91c1c','target-arrow-color':'#b91c1c','opacity':1,'z-index':20,'line-style':'solid','arrow-scale':1.3}},
      {selector:'edge.tree-reveal',style:{'width':3.5,'line-color':'#7c3aed','target-arrow-color':'#7c3aed','opacity':1,'z-index':24,'curve-style':'bezier','control-point-step-size':90,'line-style':'dashed','line-dash-pattern':[10,6]}}
    ],
    layout:{name:'preset'}
  });
  cy.on('tap','node',e=>{const id=e.target.id(); if(id.indexOf('axis-')===0||id==='loosehead')return; selectPerson(id,false);});
  cy.on('tap',e=>{if(e.target===cy) clearHL();});
  cy.on('mousemove',ev=>{if(ev.renderedPosition) lastPointer={x:ev.renderedPosition.x,y:ev.renderedPosition.y,t:performance.now()};});
  cy.on('pan',()=>{if(!placing&&!layoutAnim) anchorId=null; paintRail();});
  cy.on('mouseover','edge',e=>{const d=e.target.data();e.target.style('label',(TYPE_CN[d.type]||'')+(d.detail?'：'+d.detail:'')+(CONF_CN[d.conf]?'（'+CONF_CN[d.conf]+'）':''));e.target.style({'font-size':11,'text-background-color':'#fff','text-background-opacity':0.9,'text-background-padding':2});});
  cy.on('mouseout','edge',e=>e.target.removeStyle('label'));
  cy.on('zoom',()=>{syncZoomSlider();syncSpreadToZoom(); paintRail();});
  drawNetwork();
}
function filters(){
  const types=[...document.querySelectorAll('.types input[data-type]')].filter(i=>i.checked).map(i=>i.dataset.type);
  return {types:new Set(types),onlyDoc:$('#onlyDoc').checked,partners:$('#showPartner').checked,gmin:+$('#gmin').value,gmax:+$('#gmax').value};
}
function personOk(p,f){return !p.generation||(p.generation>=f.gmin&&p.generation<=f.gmax);}
function relOk(r,f){
  if(r.type==='partner') return !!f.partners&&(!f.onlyDoc||r.confidence==='documented');
  return f.types.has(r.type)&&(!f.onlyDoc||r.confidence==='documented');
}
function drawNetwork(){
  layoutLock=true;
  if(cy) cy.autoungrabify(false);
  const f=filters();
  const rels=R.filter(r=>relOk(r,f)&&byId[r.from]._linked&&byId[r.to]._linked&&personOk(byId[r.from],f)&&personOk(byId[r.to],f));
  // Partner links are drawn only. They do not pull people into the map or move layout positions.
  const used=new Set();rels.forEach(r=>{if(r.type!=='partner'){used.add(r.from);used.add(r.to);}});
  const nodes=P.filter(p=>p._linked&&personOk(p,f)&&(used.has(p.id)||(p.role!=='relative'&&f.types.has('master_disciple'))));
  const ids=new Set(nodes.map(p=>p.id));
  const drawRels=rels.filter(r=>r.type!=='partner'||(ids.has(r.from)&&ids.has(r.to)));
  cy.startBatch();cy.elements().remove();
  cy.add(nodes.map(nodeData));cy.add(drawRels.map(edgeData));
  cy.endBatch();
  cy.minZoom(Z_MIN);cy.maxZoom(Z_MAX);
  cy.layout({name:'preset',fit:true,padding:20}).run();
  captureHome();
  spread={};
  Object.keys(home).forEach(id=>{
    const s=SPREAD[id];
    spread[id]=s?{x:s[0],y:s[1]}:{x:home[id].x,y:home[id].y};
  });
  spreadReady=true;
  layoutT=0;
  layoutLock=false;
  stat(nodes.length,drawRels.length);
  if(state.focus&&cy.getElementById(state.focus).length) highlight(state.focus,false);
  updateLayoutButtons();
  updateModeTabs();
}
function nebulaNodeData(p){
  const n=nodeData(p);
  n.classes='nebula';
  const rec=NEBULA[p.id];
  if(rec){
    n.position={x:rec[0],y:rec[1]};
    if(rec[2]) n.data.size=rec[2];
  }
  return n;
}
function drawNebula(){
  layoutLock=true;
  if(cy) cy.autoungrabify(false);
  if(layoutAnim){cancelAnimationFrame(layoutAnim); layoutAnim=0;}
  state.mode='nebula';
  cy.minZoom(1e-7);cy.maxZoom(32);
  const f=filters();
  const rels=R.filter(r=>relOk(r,f)&&byId[r.from]._linked&&byId[r.to]._linked&&personOk(byId[r.from],f)&&personOk(byId[r.to],f));
  const used=new Set();
  rels.forEach(r=>{if(r.type!=='partner'){used.add(r.from);used.add(r.to);}});
  const nodes=P.filter(p=>p._linked&&personOk(p,f)&&(used.has(p.id)||(!!NEBULA[p.id]&&p.role!=='relative')));
  const ids=new Set(nodes.map(p=>p.id));
  const drawRels=rels.filter(r=>ids.has(r.from)&&ids.has(r.to));
  cy.startBatch();cy.elements().remove();
  cy.add(nodes.map(nebulaNodeData));cy.add(drawRels.map(edgeData));
  cy.endBatch();
  cy.fit(undefined,36);
  // Full-map fit makes every dot a speck. Open close enough that hubs and
  // their names read; zooming out still reaches the whole star map.
  // On a phone the opening zoom is fitted to the narrower width.
  const openZ=cy.width()<700?Math.max(0.7, Math.min(1.05, 300/cy.width())):0.34;
  if(cy.zoom()<openZ){
    const bb=cy.elements().boundingBox();
    const cx=(bb.x1+bb.x2)/2, cy0=(bb.y1+bb.y2)/2;
    cy.zoom(openZ);
    cy.pan({x:cy.width()/2-cx*openZ, y:cy.height()/2-cy0*openZ});
  }
  layoutLock=false;
  stat(nodes.length,drawRels.length);
  syncZoomSlider();
  updateModeTabs();
}
function updateModeTabs(){
  document.querySelectorAll('.mode-tabs a').forEach(a=>{
    a.classList.toggle('active', a.dataset.mode===state.mode);
  });
  const ego=document.querySelector('.mode-tabs a[data-mode="ego"]');
  const neb=document.querySelector('.mode-tabs a[data-mode="nebula"]');
  const tree=document.querySelector('.mode-tabs a[data-mode="tree"]');
  const id=state.focus||(P.find(p=>p.name==='侯宝林')||P[0]||{}).id||'';
  if(ego&&id) ego.href='#graph/'+id;
  if(neb) neb.href=state.focus?'#nebula/'+state.focus:'#nebula';
  if(tree) tree.href='#tree/'+(state.treeVariant||'era');
}
function egoSet(id){
  const f=filters(),dd=+$('#depthDown').value,du=+$('#depthUp').value;
  const keep=new Set([id]),rels=new Set();
  // up
  let front=[id];
  for(let d=0;d<du&&front.length;d++){const nx=[];front.forEach(x=>adj[x].forEach(r=>{if(r.type==='master_disciple'&&r.to===x&&relOk(r,f)){rels.add(r);if(!keep.has(r.from)){keep.add(r.from);nx.push(r.from);}}}));front=nx;}
  front=[id];
  for(let d=0;d<dd&&front.length;d++){const nx=[];front.forEach(x=>adj[x].forEach(r=>{if(r.type==='master_disciple'&&r.from===x&&relOk(r,f)){rels.add(r);if(!keep.has(r.to)){keep.add(r.to);nx.push(r.to);}}}));front=nx;}
  adj[id].forEach(r=>{if(r.type!=='partner'&&relOk(r,f)){rels.add(r);keep.add(r.from);keep.add(r.to);}});
  // lineage edges among kept; partner edges are drawn but never add people or change placement
  R.forEach(r=>{if(r.type!=='partner'&&keep.has(r.from)&&keep.has(r.to)&&relOk(r,f))rels.add(r);});
  R.forEach(r=>{if(r.type==='partner'&&keep.has(r.from)&&keep.has(r.to)&&relOk(r,f))rels.add(r);});
  return {nodes:[...keep].map(k=>byId[k]),rels:[...rels]};
}
function nodeSize(p){return Math.max(12,Math.min(70,10+Math.sqrt(p._deg||1)*6));}
function labelFont(p){return p._deg>=15?16:(p._deg<6?10:12);}
function labelRadius(p){
  const font=labelFont(p);
  const chars=[...labelOf(p)].length;
  const halfW=chars*font*0.5+8;
  const halfH=nodeSize(p)/2+font+6;
  return Math.hypot(halfW, halfH);
}
function edgeDetail(from,to){
  const r=(adj[from]||[]).find(x=>x.type==='master_disciple'&&x.from===from&&x.to===to);
  return (r&&r.detail)||'';
}
function discipleSort(parent,a,b){
  const da=edgeDetail(parent,a),db=edgeDetail(parent,b);
  if(da!==db) return da.localeCompare(db,'zh');
  const ga=byId[a].generation||0,gb=byId[b].generation||0;
  if(ga!==gb) return ga-gb;
  return byId[a].name.localeCompare(byId[b].name,'zh');
}
function layoutRadial(rootId,ids,rels){
  const idset=new Set(ids);
  const pos={[rootId]:{x:0,y:0}};
  const children=new Map();
  idset.forEach(id=>children.set(id,[]));
  const seen=new Set([rootId]);
  let front=[rootId];
  while(front.length){
    const nx=[];
    for(const id of front){
      const ch=[];
      for(const r of rels){
        if(r.type==='master_disciple'&&r.from===id&&idset.has(r.to)&&!seen.has(r.to)){
          seen.add(r.to);ch.push(r.to);nx.push(r.to);
        }
      }
      ch.sort((a,b)=>discipleSort(id,a,b));
      children.set(id,ch);
    }
    front=nx;
  }
  const ancestors=[];
  front=[rootId];
  const upSeen=new Set([rootId]);
  while(front.length){
    const nx=[],layer=[];
    for(const id of front){
      for(const r of rels){
        if(r.type==='master_disciple'&&r.to===id&&idset.has(r.from)&&!seen.has(r.from)&&!upSeen.has(r.from)){
          upSeen.add(r.from);seen.add(r.from);layer.push(r.from);nx.push(r.from);
        }
      }
    }
    layer.sort((a,b)=>byId[a].name.localeCompare(byId[b].name,'zh'));
    ancestors.push(...layer);
    front=nx;
  }
  function packAround(list,r0){
    let r=Math.max(24,r0),i=0,outer=r0;
    let guard=0;
    while(i<list.length&&guard++<list.length+8){
      const start=i; let ang=-Math.PI; const placed=[];
      while(i<list.length){
        const id=list[i], rad=labelRadius(byId[id]), need=rad*2+14;
        if(need>=2*r-1){r=need/2+12; i=start; ang=-Math.PI; placed.length=0; continue;}
        const step=2*Math.asin(Math.min(0.999,need/(2*r)));
        if(placed.length&&ang+step>Math.PI+1e-3) break;
        placed.push({id,ang:ang+step/2,r,rad});
        ang+=step; i++;
      }
      if(!placed.length){r+=36; i=start; continue;}
      let maxRad=0;
      placed.forEach(p=>{pos[p.id]={x:Math.cos(p.ang)*p.r,y:Math.sin(p.ang)*p.r}; maxRad=Math.max(maxRad,p.rad);});
      outer=r+maxRad;
      const nextRad=i<list.length?labelRadius(byId[list[i]]):maxRad;
      r=r+maxRad+nextRad+18;
    }
    return outer;
  }
  function placeKids(id){
    const ch=children.get(id)||[];
    if(!ch.length||!pos[id]) return;
    const p=pos[id], ang0=Math.atan2(p.y,p.x)||0;
    let r=Math.hypot(p.x,p.y)+labelRadius(byId[id])+labelRadius(byId[ch[0]])+18;
    let angles=[],total=99;
    for(let g=0;g<10;g++){
      angles=ch.map(cid=>2*Math.asin(Math.min(0.999,(labelRadius(byId[cid])*2+14)/(2*r))));
      total=angles.reduce((s,a)=>s+a,0);
      if(total<=Math.PI*1.25) break;
      r*=1.22;
    }
    let a=ang0-total/2;
    ch.forEach((cid,i)=>{
      const mid=a+angles[i]/2;
      pos[cid]={x:Math.cos(mid)*r,y:Math.sin(mid)*r};
      a+=angles[i];
    });
  }
  const rootKids=children.get(rootId)||[];
  let outer=labelRadius(byId[rootId])+20;
  if(rootKids.length){
    const first=labelRadius(byId[rootKids[0]]);
    outer=packAround(rootKids, labelRadius(byId[rootId])+first+18);
  }
  const depth=new Map();
  (function mark(id,d){(children.get(id)||[]).forEach(c=>{depth.set(c,d);mark(c,d+1);});})(rootId,1);
  const maxD=Math.max(0,...depth.values(),0);
  for(let d=2;d<=maxD;d++){
    const parents=[...depth.entries()].filter(([,dd])=>dd===d-1).map(([id])=>id);
    parents.sort((a,b)=>Math.atan2(pos[a].y,pos[a].x)-Math.atan2(pos[b].y,pos[b].x));
    parents.forEach(placeKids);
  }
  Object.values(pos).forEach(p=>{outer=Math.max(outer,Math.hypot(p.x,p.y)+8);});
  if(ancestors.length){
    const gap=10;
    const widths=ancestors.map(id=>labelRadius(byId[id])*2);
    const total=widths.reduce((s,w)=>s+w,0)+gap*(ancestors.length-1);
    let x=-total/2;
    const y=-(outer+24+Math.max(...ancestors.map(id=>labelRadius(byId[id]))));
    ancestors.forEach((id,i)=>{
      const rad=labelRadius(byId[id]);
      pos[id]={x:x+rad,y};
      x+=rad*2+gap;
    });
  }
  const extras=ids.filter(id=>!pos[id]);
  extras.forEach((id,i)=>{
    let anchor=rootId;
    for(const r of rels){
      if(r.from===id&&pos[r.to]){anchor=r.to;break;}
      if(r.to===id&&pos[r.from]){anchor=r.from;break;}
    }
    const a=pos[anchor]||{x:0,y:0};
    const ang=Math.atan2(a.y,a.x)||(-Math.PI/2+(i+1)*0.35);
    const dist=Math.hypot(a.x,a.y)+labelRadius(byId[anchor])+labelRadius(byId[id])+16;
    pos[id]={x:Math.cos(ang)*dist,y:Math.sin(ang)*dist};
  });
  relax(pos,ids,[rootId]);
  return pos;
}
function relax(pos,ids,pin){
  const pinSet=new Set(pin||[]);
  const rad={};
  ids.forEach(id=>{if(byId[id]) rad[id]=labelRadius(byId[id]);});
  for(let iter=0;iter<56;iter++){
    let moved=false;
    for(let i=0;i<ids.length;i++){
      for(let j=i+1;j<ids.length;j++){
        const A=pos[ids[i]],B=pos[ids[j]];
        if(!A||!B) continue;
        const pinA=pinSet.has(ids[i]),pinB=pinSet.has(ids[j]);
        if(pinA&&pinB) continue;
        let dx=B.x-A.x,dy=B.y-A.y;
        let d=Math.hypot(dx,dy)||0.01;
        const need=(rad[ids[i]]||16)+(rad[ids[j]]||16)+8;
        if(d>=need) continue;
        const push=(need-d)/(pinA||pinB?1:2);
        dx/=d;dy/=d;
        if(!pinA){A.x-=dx*push;A.y-=dy*push;}
        if(!pinB){B.x+=dx*push;B.y+=dy*push;}
        moved=true;
      }
    }
    if(!moved) break;
  }
}
function captureHome(){
  home={};
  cy.nodes().forEach(n=>{const p=n.position(); home[n.id()]={x:p.x,y:p.y};});
}
function spreadAmount(z){
  if(z<=Z_LO) return 0;
  if(z>=Z_HI) return 1;
  const u=(z-Z_LO)/(Z_HI-Z_LO);
  return u*u*(3-2*u);
}
function anchorPoint(){
  if(lastPointer&&performance.now()-lastPointer.t<700) return {x:lastPointer.x,y:lastPointer.y};
  return {x:cy.width()/2,y:cy.height()/2};
}
function nearestNode(rx,ry){
  let best=null,bd=1e18;
  cy.nodes().forEach(n=>{
    const p=n.renderedPosition();
    const d=(p.x-rx)*(p.x-rx)+(p.y-ry)*(p.y-ry);
    if(d<bd){bd=d;best=n;}
  });
  return best;
}
function snapSpread(t,aid,pt){
  if(!spreadReady) return;
  if(!pt) pt=anchorPoint();
  if(!aid){const n=nearestNode(pt.x,pt.y); aid=n&&n.id();}
  const z=cy.zoom();
  placing=true;
  cy.startBatch();
  cy.nodes().forEach(n=>{
    const h=home[n.id()], s=spread[n.id()];
    if(!h||!s) return;
    n.position({x:h.x+(s.x-h.x)*t, y:h.y+(s.y-h.y)*t});
  });
  cy.endBatch();
  if(aid&&home[aid]&&spread[aid]){
    const x=home[aid].x+(spread[aid].x-home[aid].x)*t;
    const y=home[aid].y+(spread[aid].y-home[aid].y)*t;
    cy.pan({x:pt.x-x*z, y:pt.y-y*z});
  }
  placing=false;
  layoutT=t;
}
function easeSpread(){
  layoutAnim=0;
  if(state.mode==='ego'||layoutLock||!spreadReady) return;
  const goal=spreadAmount(cy.zoom());
  const diff=goal-layoutT;
  if(Math.abs(diff)<0.01){if(Math.abs(diff)>0.0001) snapSpread(goal,anchorId,anchorPt); anchorId=null; return;}
  if(!anchorId){
    anchorPt=anchorPoint();
    const focus=state.focus&&cy.getElementById(state.focus);
    if(focus&&focus.length){
      const p=focus.renderedPosition();
      if(p.x>-30&&p.x<cy.width()+30&&p.y>-30&&p.y<cy.height()+30){
        anchorId=state.focus;
        anchorPt={x:Math.min(cy.width()-8,Math.max(8,p.x)),y:Math.min(cy.height()-8,Math.max(8,p.y))};
      }
    }
    if(!anchorId){
      const n=nearestNode(anchorPt.x,anchorPt.y);
      anchorId=n&&n.id();
    }
  }
  snapSpread(layoutT+diff*0.45, anchorId, anchorPt);
  layoutAnim=requestAnimationFrame(easeSpread);
}
function syncSpreadToZoom(){
  if(layoutLock||state.mode!=='network'||!spreadReady) return;
  if(Math.abs(spreadAmount(cy.zoom())-layoutT)<0.004) return;
  if(!layoutAnim) layoutAnim=requestAnimationFrame(easeSpread);
}
function zoomToRead(){
  if(state.mode==='ego'&&state.focus){drawEgo(state.focus);return;}
  const id=state.focus&&cy.getElementById(state.focus).length?state.focus:null;
  const n=id?cy.getElementById(id):nearestNode(cy.width()/2,cy.height()/2);
  if(n&&n.length) cy.center(n);
  zoomAtCenter(Math.max(cy.zoom(), Z_HI+0.15));
}
function resetGlobal(){
  if(layoutAnim){cancelAnimationFrame(layoutAnim); layoutAnim=0;}
  anchorId=null;
  const wasEgo=state.mode==='ego';
  state.mode='network';
  $('#mode').value='network';
  syncMode();
  if(location.hash.startsWith('#graph/')) history.replaceState(null,'','#graph');
  layoutLock=true;
  if(wasEgo||!spreadReady) drawNetwork();
  else {snapSpread(0,null,{x:cy.width()/2,y:cy.height()/2}); cy.fit(undefined,28); layoutT=0;}
  layoutLock=false;
  syncZoomSlider();
  updateLayoutButtons();
}
function updateLayoutButtons(){}
function drawEgo(id){
  layoutLock=true;
  if(cy) cy.autoungrabify(false);
  if(layoutAnim){cancelAnimationFrame(layoutAnim); layoutAnim=0;}
  cy.minZoom(Z_MIN);cy.maxZoom(Z_MAX);
  const s=egoSet(id);
  const ids=s.nodes.map(p=>p.id);
  const local=layoutRadial(id,ids,s.rels);
  cy.startBatch();cy.elements().remove();
  cy.add(s.nodes.map(p=>{const n=nodeData(p); n.position=local[p.id]||{x:0,y:0}; return n;}));
  cy.add(s.rels.map(edgeData));
  cy.endBatch();
  cy.nodes().addClass('local');
  const eles=cy.nodes();
  cy.fit(eles,44);
  if(cy.zoom()<1.2){cy.center(cy.getElementById(id)); zoomAtCenter(1.2);}
  syncZoomSlider();
  stat(s.nodes.length,s.rels.length);
  highlight(id,false);
  updateLayoutButtons();
  layoutLock=false;
}
function stat(n,e){
  const tag=state.mode==='ego'?' · 聚焦环形谱系':(state.mode==='tree'?' · 家谱':'');
  $('#stat').textContent='当前显示 '+n+' 人 · '+e+' 条关系（全库 '+P.length+' 人 · '+R.length+' 条）'+tag;
}
function clearHL(){
  if(cy) cy.edges('.tree-reveal').remove();
  cy.elements().removeClass('faded hl nb tree-link');
}
function revealOtherLines(id){
  const add=[], seen=new Set();
  R.forEach(r=>{
    if(!r||r.type==='master_disciple') return;
    if(r.from!==id&&r.to!==id) return;
    if(!cy.getElementById(r.from).length||!cy.getElementById(r.to).length) return;
    const eid='reveal-'+r.id;
    if(seen.has(eid)) return;
    seen.add(eid);
    add.push({classes:'tree-reveal', data:{id:eid, source:r.from, target:r.to, type:r.type, conf:r.confidence, detail:r.detail||r.subtype||''}});
  });
  if(add.length) cy.add(add);
}
function highlightTree(id,center){
  const n=cy.getElementById(id);if(!n.length)return;
  clearHL();
  revealOtherLines(id);
  cy.elements().addClass('faded');
  const edges=n.connectedEdges();
  const near=edges.connectedNodes();
  near.removeClass('faded').addClass('nb');
  n.removeClass('faded').addClass('hl');
  edges.filter(e=>!e.hasClass('tree-reveal')).removeClass('faded').addClass('tree-link');
  edges.filter('.tree-reveal').removeClass('faded');
  if(center) cy.animate({center:{eles:n},zoom:Math.max(cy.zoom(),0.9)},{duration:350});
}
function highlight(id,center){
  if(state.mode==='tree'){highlightTree(id,center);return;}
  const n=cy.getElementById(id);if(!n.length)return;
  clearHL();
  const nb=n.closedNeighborhood();
  nb.nodes().addClass('nb');n.addClass('hl');n.connectedEdges().addClass('hl');
  if(center) cy.animate({center:{eles:n},zoom:Math.max(cy.zoom(),0.9)},{duration:450});
}
function selectPerson(id,center){
  state.focus=id;
  if(!byId[id]._linked){
    renderPanel(id);
    if(state.mode==='ego'){state.mode='network';$('#mode').value='network';syncMode();drawNetwork();}
    const next=state.mode==='nebula'?'#nebula':(state.mode==='tree'?'#tree/'+(state.treeVariant||'era'):'#3d');
    if(location.hash!==next) history.replaceState(null,'',next);
    if(cy) clearHL();
    updateModeTabs();
    return;
  }
  if(state.mode==='ego'){drawEgo(id);}
  else if(state.mode==='tree'){
    if(!cy.getElementById(id).length) drawTree();
    highlight(id,true);
    if(window.XSMobile&&XSMobile.layout()!=='pane') XSMobile.openPanel();
  }else highlight(id,center);
  renderPanel(id);
  const next=state.mode==='nebula'?'#nebula/'+id:(state.mode==='tree'?'#tree/'+id:(state.mode==='ego'?'#graph/'+id:'#graph/'+id));
  if(location.hash!==next) history.replaceState(null,'',next);
  updateModeTabs();
}
function plink(id){const p=byId[id];return '<span class="pl" data-id="'+id+'">'+esc(labelOf(p))+'</span>';}
function srcLinks(arr){return (arr||[]).map((u,i)=>'<a href="'+esc(u)+'" target="_blank" rel="noopener" title="'+esc(u)+'">['+(i+1)+']</a>').join(' ');}
function relLine(r,other){
  return '<li>'+plink(other)+(r.detail?' <small>'+esc(r.detail)+'</small>':'')+'<span class="tag'+(r.confidence==='disputed'?' dis':'')+'">'+(CONF_CN[r.confidence]||'')+'</span> <small>'+srcLinks(r.sources)+'</small>'+(r.notes&&r.notes.length?'<br><small class="muted">'+esc(r.notes.join('；'))+'</small>':'')+'</li>';
}
function renderPanel(id){
  const p=byId[id];const rs=adj[id];
  const masters=rs.filter(r=>r.type==='master_disciple'&&r.to===id);
  const dis=rs.filter(r=>r.type==='master_disciple'&&r.from===id);
  const sib=new Map();masters.forEach(m=>adj[m.from].forEach(r=>{if(r.type==='master_disciple'&&r.from===m.from&&r.to!==id)sib.set(r.to,1);}));
  const kin=rs.filter(r=>r.type==='kin'),mar=rs.filter(r=>r.type==='marriage'),oth=rs.filter(r=>r.type==='other'),par=rs.filter(r=>r.type==='partner');
  const sec=(t,arr,fn)=>arr.length?'<h3>'+t+'（'+arr.length+'）</h3><ul>'+arr.map(fn).join('')+'</ul>':'';
  const yrs=(p.birth||p.death)?(p.birth||'?')+'–'+(p.death||''):'';
  const confTag=p.confidence?'<span class="tag'+(p.confidence==='disputed'?' dis':'')+'">'+CONF_CN[p.confidence]+'</span>':'';
  const off=p._linked?'':'<p class="notice">没有任何关系，几张图都不画出此人。</p>';
  const ly=LIYUAN_XO[id];
  const lyBadge=ly?'<p class="xo-badge">梨园谱系里的同一人 <a href="liyuan/#graph/'+encodeURIComponent(ly)+'">打开梨园图谱</a></p>':'';
  $('#panel').innerHTML='<h2>'+esc(labelOf(p))+'</h2>'+lyBadge+off+
   '<div class="meta">'+(p.generation?'第'+p.generation+'代'+(p.zibei?'·“'+p.zibei+'”字辈':''):'代数不详')+(p.gen_source?'<span class="tag">'+esc(p.gen_source)+'</span>':'')+(yrs?' · '+yrs:'')+(p.role==='relative'?' · 非谱系内亲属':'')+(confTag?' '+confTag:'')+'</div>'+
   '<div class="panel-actions"><button type="button" id="egoBtn">'+(state.mode==='ego'?'回到全网络':'聚焦此人的师承子图')+'</button>'+
   '<button type="button" class="feedback-btn" id="panelFeedback">提交修正</button></div>'+
   (p.aliases&&p.aliases.length?'<div>别名/本名：'+esc(p.aliases.join('、'))+'</div>':'')+
   (p.notes&&p.notes.length?'<div class="muted" style="margin-top:6px">'+p.notes.map(esc).join('<br>')+'</div>':'')+
   sec('师父',masters,r=>relLine(r,r.from))+
   sec('徒弟',dis,r=>relLine(r,r.to))+
   sec('代拉 / 引保代 / 口盟等',oth,r=>relLine(r,r.from===id?r.to:r.from))+
   sec('亲属',kin,r=>relLine(r,r.from===id?r.to:r.from))+
   sec('姻缘',mar,r=>relLine(r,r.from===id?r.to:r.from))+
   sec('固定搭档',par,r=>relLine(r,r.from===id?r.to:r.from))+
   (sib.size?'<h3>同门（'+sib.size+'）</h3><div style="line-height:1.9">'+[...sib.keys()].map(plink).join('、')+'</div>':'')+
   '<h3>来源</h3><div>'+(p.wiki_url?'<a href="'+esc(p.wiki_url)+'" target="_blank" rel="noopener">维基百科条目</a> ':'')+srcLinks(p.sources)+'</div>';
  $('#egoBtn').onclick=()=>{
    if(state.mode==='ego'){resetGlobal();renderPanel(id);return;}
    state.focus=id;
    if(location.hash==='#graph/'+id){state.mode='ego';$('#mode').value='ego';syncMode();drawEgo(id);renderPanel(id);updateModeTabs();}
    else location.hash='#graph/'+id;
  };
  $('#panelFeedback').onclick=()=>openFeedback(id);
}
function syncMode(){
  document.querySelectorAll('.ego-only').forEach(e=>e.style.display=state.mode==='ego'?'':'none');
  document.querySelectorAll('.tree-only').forEach(e=>e.style.display=state.mode==='tree'?'inline-flex':'none');
  document.querySelectorAll('#treeVariant button').forEach(b=>b.classList.toggle('on', b.dataset.variant===(state.treeVariant||'era')));
}
function bindUI(){
  $('#panel').addEventListener('click',e=>{const t=e.target.closest('.pl');if(t){selectPerson(t.dataset.id,true);}});
  const q=$('#q'),sg=$('#suggest');let sel=-1,items=[];
  q.addEventListener('input',()=>{
    const v=q.value.trim();sel=-1;
    if(!v){sg.hidden=true;return;}
    items=P.filter(p=>p._search.includes(v)).sort((a,b)=>(a.name===v?-1:0)-(b.name===v?-1:0)||(a.name.indexOf(v)-b.name.indexOf(v))||b._deg-a._deg).slice(0,30);
    sg.innerHTML=items.length?items.map((p,i)=>'<li data-i="'+i+'">'+esc(labelOf(p))+'<small>'+(p.generation?'第'+p.generation+'代':'')+(p.aliases.length?' · '+esc(p.aliases.slice(0,2).join('、')):'')+'</small></li>').join(''):'<li><small>无匹配</small></li>';
    sg.hidden=false;
  });
  q.addEventListener('keydown',e=>{
    const lis=sg.querySelectorAll('li[data-i]');
    if(e.key==='ArrowDown'){sel=Math.min(sel+1,lis.length-1);}else if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);}
    else if(e.key==='Enter'){const i=sel>=0?sel:0;if(items[i])pick(items[i]);return;}else if(e.key==='Escape'){sg.hidden=true;return;}else return;
    lis.forEach((l,i)=>l.classList.toggle('sel',i===sel));e.preventDefault();
  });
  sg.addEventListener('mousedown',e=>{const li=e.target.closest('li[data-i]');if(li){e.preventDefault();pick(items[+li.dataset.i]);}});
  q.addEventListener('blur',()=>setTimeout(()=>sg.hidden=true,150));
  function pick(p){q.value=p.name;sg.hidden=true;
    if(state.mode==='network'&&!cy.getElementById(p.id).length){ // ensure visible
      $('#gmin').value=$('#gmin').options[0].value;$('#gmax').value=$('#gmax').options[$('#gmax').options.length-1].value;drawNetwork();}
    selectPerson(p.id,true);}
  $('#mode').addEventListener('change',e=>{
    const v=e.target.value;
    if(v==='nebula'){location.hash=state.focus?'#nebula/'+state.focus:'#nebula';return;}
    if(v==='tree'){location.hash='#tree/'+(state.treeVariant||'era');return;}
    if(v==='network'){location.hash='#3d';return;}
    const id=state.focus||(P.find(p=>p.name==='侯宝林')||{}).id||'';
    location.hash='#graph/'+id;
  });
  ['#depthDown','#depthUp'].forEach(s=>$(s).addEventListener('change',()=>{if(state.mode==='ego'&&state.focus)drawEgo(state.focus);}));
  const refilter=()=>{if(state.mode==='ego'&&state.focus)drawEgo(state.focus);else if(state.mode==='nebula')drawNebula();else if(state.mode==='tree')drawTree();else drawNetwork();};
  ['#gmin','#gmax','#onlyDoc','#showPartner'].forEach(s=>$(s).addEventListener('change',refilter));
  document.querySelectorAll('.types input[data-type]').forEach(i=>i.addEventListener('change',refilter));
  $('#fit').onclick=()=>{
    if(state.mode==='ego'){cy.fit(cy.nodes(),44);syncZoomSlider();return;}
    if(state.mode==='nebula'){cy.fit(undefined,40);syncZoomSlider();return;}
    if(state.mode==='tree'){openTreeView();syncZoomSlider();return;}
    resetGlobal();
  };
  $('#expand').onclick=()=>{
    if(state.mode!=='nebula'){zoomToRead();return;}
    const n=state.focus&&cy.getElementById(state.focus);
    if(n&&n.length) cy.center(n);
    zoomAtCenter(Math.max(cy.zoom(),1.15));
  };
  $('#resetLayout').onclick=()=>{
    if(state.mode==='nebula'){cy.fit(undefined,40);syncZoomSlider();return;}
    resetGlobal();
  };
  $('#labels').addEventListener('change',e=>cy.nodes().toggleClass('alllabels',e.target.checked));
  $('#zoom').addEventListener('input',()=>{
    zoomFromSlider=true;
    zoomAtCenter(zoomFromSliderValue($('#zoom').value));
    zoomFromSlider=false;
  });
  $('#zoomIn').addEventListener('click',()=>zoomAtCenter(cy.zoom()*1.25));
  $('#zoomOut').addEventListener('click',()=>zoomAtCenter(cy.zoom()/1.25));
  $('#feedbackBtn').addEventListener('click',()=>openFeedback(state.focus));
  $('#fbClose').addEventListener('click',()=>$('#feedbackDlg').close());
  $('#feedbackDlg').addEventListener('click',e=>{if(e.target.id==='feedbackDlg') $('#feedbackDlg').close();});
  document.querySelectorAll('#treeVariant button').forEach(b=>b.addEventListener('click',()=>{
    state.treeVariant=b.dataset.variant;
    const id=state.focus;
    location.hash='#tree/'+(id&&byId[id]?id:state.treeVariant);
  }));
  const treeLinks=$('#treeLinks');
  if(treeLinks) treeLinks.addEventListener('change',()=>{ if(state.mode==='tree') drawTree(); });
  function refitAfterLayout(){
    if(!cy) return;
    cy.resize();
    if(state.mode==='nebula') drawNebula();
    else if(state.mode==='tree') openTreeView();
    else if(state.mode==='ego'&&state.focus) cy.fit(cy.nodes(),28);
    else if(state.mode==='network') cy.fit(undefined,24);
    syncZoomSlider();
  }
  document.addEventListener('xsmobile', ev=>{ state._vw=ev.detail&&ev.detail.w; state._vh=ev.detail&&ev.detail.h; refitAfterLayout(); });
  document.addEventListener('xsmobile-resize', ev=>{
    if(!cy) return;
    cy.resize();
    const d=ev.detail||{};
    const dw=Math.abs((d.w||0)-(state._vw||0)), dh=Math.abs((d.h||0)-(state._vh||0));
    if(dw>40||dh>40){ state._vw=d.w; state._vh=d.h; refitAfterLayout(); }
  });
  syncZoomSlider();
  syncMode();
  updateLayoutButtons();
}
function formatZoom(z){
  if(z>=10) return z.toFixed(0)+'×';
  if(z>=1) return z.toFixed(1)+'×';
  return z.toFixed(2)+'×';
}
function sliderFromZoom(z){
  const z0=cy.minZoom(), z1=cy.maxZoom();
  const t=Math.log(z/z0)/Math.log(z1/z0);
  return Math.round(Math.min(1,Math.max(0,t))*1000);
}
function zoomFromSliderValue(v){
  const z0=cy.minZoom(), z1=cy.maxZoom();
  return z0*Math.pow(z1/z0, Number(v)/1000);
}
function syncZoomSlider(){
  if(!cy) return;
  const z=cy.zoom(),el=$('#zoom');
  if(!el) return;
  const label=formatZoom(z);
  $('#zoomVal').textContent=label;
  el.setAttribute('aria-valuetext',label);
  $('#zoomIn').disabled=z>=Z_MAX*0.999;
  $('#zoomOut').disabled=z<=Z_MIN*1.001;
  if(!zoomFromSlider) el.value=String(sliderFromZoom(z));
}
function zoomAtCenter(level){
  const z0=cy.zoom();
  const z=Math.min(Z_MAX,Math.max(Z_MIN,level));
  const w=cy.width(),h=cy.height();
  if(!(w>1&&h>1)||!(z0>0)){cy.zoom(z);return;}
  const pan=cy.pan();
  const mx=(w/2-pan.x)/z0, my=(h/2-pan.y)/z0;
  if(typeof cy.viewport==='function') cy.viewport({zoom:z,pan:{x:w/2-mx*z,y:h/2-my*z}});
  else {cy.zoom(z);cy.pan({x:w/2-mx*z,y:h/2-my*z});}
}
function joinCapped(items,n){
  if(!items.length) return '（无）';
  if(items.length<=n) return items.join('、');
  return items.slice(0,n).join('、')+'……等共 '+items.length+' 人';
}
function relNames(id,pred){
  return (adj[id]||[]).filter(pred).map(r=>{
    const oid=r.from===id?r.to:r.from;
    const name=byId[oid]?byId[oid].name:oid;
    return name+(r.detail?'·'+r.detail:'')+(CONF_CN[r.confidence]?'（'+CONF_CN[r.confidence]+'）':'');
  });
}
function issueTitle(personId){
  if(personId&&byId[personId]) return '修正：'+byId[personId].name+'（'+personId+'）';
  return '修正：相声师承谱系';
}
function issueBody(personId){
  const page=location.href;
  const ask='\n\n### 哪里有误\n请写清现有记录错在哪里。\n\n### 正确信息\n请写上应改成什么。\n\n### 来源链接\n请给出可公开核对的网页、报道或书目。\n';
  if(!personId||!byId[personId]){
    return '（未指定具体人物。若针对某位人物，请写上姓名和编号。）\n\n### 页面地址\n'+page+ask;
  }
  const p=byId[personId];
  return [
    '### 人物',
    p.name+'（'+p.id+'）'+(p.aliases&&p.aliases.length?'，别名：'+p.aliases.join('、'):''),
    '',
    '### 当前代数与关系',
    '代数：'+(p.generation?'第'+p.generation+'代':'不详')+(p.zibei?'，'+p.zibei+'字辈':''),
    '师父：'+joinCapped(relNames(personId,r=>r.type==='master_disciple'&&r.to===personId),20),
    '徒弟：'+joinCapped(relNames(personId,r=>r.type==='master_disciple'&&r.from===personId),25),
    '代拉 / 引保代 / 口盟等：'+joinCapped(relNames(personId,r=>r.type==='other'),15),
    '亲缘：'+joinCapped(relNames(personId,r=>r.type==='kin'),15),
    '姻缘：'+joinCapped(relNames(personId,r=>r.type==='marriage'),10),
    '',
    '### 页面地址',
    page
  ].join('\n')+ask;
}
function issueUrl(personId){
  const id=(personId&&byId[personId])?personId:null;
  const q=new URLSearchParams({template:'correction.md',title:issueTitle(id),body:issueBody(id)});
  return 'https://github.com/accuratep0wer/xiangsheng-genealogy/issues/new?'+q.toString();
}
function openFeedback(personId){
  const id=(personId&&byId[personId])?personId:null;
  $('#fbTitle').textContent=issueTitle(id);
  $('#fbPreview').textContent=issueBody(id);
  $('#feedbackGo').href=issueUrl(id);
  const dlg=$('#feedbackDlg');
  if(!dlg.open) dlg.showModal();
}
let TREE=null;
function treeCompact(){
  const lay=document.documentElement.getAttribute('data-layout')||'pane';
  return lay==='sheet'||lay==='drawer';
}
function bucketYear(y){
  if(y<1862) return {label:'清咸丰前后', era:'qing'};
  if(y<=1874) return {label:'清同治', era:'qing'};
  if(y<=1908) return {label:'清光绪', era:'qing'};
  if(y<=1911) return {label:'清宣统', era:'qing'};
  if(y<=1927) return {label:'民国初', era:'roc'};
  if(y<=1949) return {label:'民国', era:'roc'};
  const d=Math.floor(y/10)*10;
  return {label:d+'s', era:'prc'};
}
function spanLabel(a,b){
  const A=bucketYear(a), B=bucketYear(b);
  if(A.label===B.label) return A;
  let end=B.label;
  if(A.era===B.era && A.era==='qing') end=B.label.replace(/^清/,'');
  return {label:A.label+'–'+end, era:bucketYear((a+b)/2).era};
}
function datedSpan(p){
  if(p.birth){
    return {start:p.birth+18, end:p.death||Math.min(p.birth+70, 2026)};
  }
  if(p.death){
    return {start:Math.max(1600, p.death-45), end:p.death};
  }
  return null;
}
function periodFromSpan(start, end, estimated){
  const s=spanLabel(Math.round(start), Math.round(end));
  return {label:s.label, era:s.era, estimated:!!estimated, sortYear:Math.round(start), end:Math.round(end)};
}
function periodFromGen(g){
  const table={
    1:['清咸丰–同治','qing',1856],
    2:['清同治–光绪','qing',1868],
    3:['清光绪','qing',1890],
    4:['清光绪–民国初','qing',1902],
    5:['民国','roc',1935],
    6:['民国–1950s','roc',1950],
    7:['1950s–80s','prc',1968],
    8:['1980s–2000s','prc',1990],
    9:['2000s–2010s','prc',2005],
    10:['2010s–2020s','prc',2015]
  };
  const gg=g||6;
  const row=table[gg]||(gg>10?table[10]:table[6]);
  return {label:row[0], era:row[1], estimated:true, sortYear:row[2], end:row[2]+30};
}
function periodOf(p, depth){
  const span=datedSpan(p);
  if(span) return periodFromSpan(span.start, span.end, false);
  return periodFromGen(p.generation||((depth||0)+1));
}
function assignPeriods(ids, depth, primary, kids){
  const period={};
  ids.forEach(id=>{
    const span=datedSpan(byId[id]);
    if(span) period[id]=periodFromSpan(span.start, span.end, false);
  });
  const levels=[...new Set(ids.map(id=>depth[id]||0))].sort((a,b)=>a-b);
  levels.forEach(d=>{
    ids.filter(id=>(depth[id]||0)===d&&!period[id]).forEach(id=>{
      const par=primary[id];
      if(!par||!period[par]) return;
      const start=(period[par].end||period[par].sortYear)+2;
      period[id]=periodFromSpan(start, Math.min(start+40, 2026), true);
    });
  });
  levels.slice().reverse().forEach(d=>{
    ids.filter(id=>(depth[id]||0)===d&&!period[id]).forEach(id=>{
      const ch=(kids[id]||[]).filter(c=>period[c]&&!period[c].estimated);
      if(!ch.length) return;
      const earliest=Math.min.apply(null, ch.map(c=>period[c].sortYear));
      period[id]=periodFromSpan(earliest-42, earliest-2, true);
    });
  });
  ids.forEach(id=>{
    if(!period[id]) period[id]=periodFromGen(byId[id].generation||((depth[id]||0)+1));
  });
  return period;
}
const ERA_COLOR={qing:'#7f1d1d', roc:'#b45309', prc:'#1d4ed8'};
function buildPedigree(compact){
  const onlyDoc=$('#onlyDoc').checked;
  const mastersOf={};
  R.forEach(r=>{
    if(r.type!=='master_disciple') return;
    if(!byId[r.from]||!byId[r.to]||!byId[r.from]._linked||!byId[r.to]._linked) return;
    if(onlyDoc&&r.confidence!=='documented') return;
    (mastersOf[r.to]=mastersOf[r.to]||[]).push(r);
  });
  const depth={}, primary={};
  function depthOf(id, stack){
    if(id in depth) return depth[id];
    const ms=mastersOf[id]||[];
    if(!ms.length){depth[id]=0; return 0;}
    if(stack.has(id)) return -1;
    stack.add(id);
    let best=-1, bestM=null, bestDoc=false;
    ms.forEach(r=>{
      const d=depthOf(r.from, stack);
      if(d<0) return;
      const doc=r.confidence==='documented';
      if(d>best||(d===best&&doc&&!bestDoc)){best=d; bestM=r.from; bestDoc=doc;}
    });
    stack.delete(id);
    if(best<0){depth[id]=0; return 0;}
    depth[id]=best+1;
    primary[id]=bestM;
    return depth[id];
  }
  P.forEach(p=>{ if(p._linked) depthOf(p.id, new Set()); });
  const kids={};
  Object.keys(primary).forEach(id=>{
    const par=primary[id];
    if(!par) return;
    (kids[par]=kids[par]||[]).push(id);
  });
  Object.keys(kids).forEach(id=>kids[id].sort((a,b)=>byId[a].name.localeCompare(byId[b].name,'zh')));
  const hasKids={};
  Object.keys(kids).forEach(id=>{ hasKids[id]=true; });
  const roots=[], loose=[];
  P.forEach(p=>{
    if(!p._linked||primary[p.id]) return;
    if(hasKids[p.id]) roots.push(p.id);
    else loose.push(p.id);
  });
  function descN(id, seen){
    if(seen.has(id)) return 0;
    seen.add(id);
    let n=0;
    (kids[id]||[]).forEach(c=>{ n+=1+descN(c, seen); });
    return n;
  }
  roots.sort((a,b)=>descN(b, new Set())-descN(a, new Set())||byId[a].name.localeCompare(byId[b].name,'zh'));
  const variant=state.treeVariant||'era';
  const boxOf={};
  function nodeBox(id){
    if(boxOf[id]) return boxOf[id];
    const p=byId[id];
    const info=periodEarly[id]||periodOf(p, depth[id]||0);
    const text=variant==='active'?info.label:p.name;
    const w=Math.max(variant==='active'?100:74, [...p.name].length*15+18, [...text].length*(variant==='active'?12:15)+20);
    const h=variant==='active'?70:50;
    boxOf[id]={w,h};
    return boxOf[id];
  }
  const onTree=new Set(roots);
  Object.keys(primary).forEach(id=>onTree.add(id));
  const periodIds=[...onTree].concat(loose);
  const periodEarly=assignPeriods(periodIds, depth, primary, kids);
  function byTime(a,b){
    const A=periodEarly[a], B=periodEarly[b];
    if(A.sortYear!==B.sortYear) return A.sortYear-B.sortYear;
    const da=byId[a].death||9999, db=byId[b].death||9999;
    if(da!==db) return da-db;
    if(!!A.estimated!==!!B.estimated) return A.estimated?1:-1;
    return byId[a].name.localeCompare(byId[b].name,'zh');
  }
  const vw=Math.max(320, (typeof cy!=='undefined'&&cy&&cy.width())||1200);
  const vh=Math.max(420, (typeof cy!=='undefined'&&cy&&cy.height())||800);
  const sample=nodeBox((roots[0])||[...onTree][0]);
  const pitch=sample.h+(compact?8:10);
  const targetH=vh*(vw<700?7:3.2);
  const colsWanted=Math.max(4, Math.ceil(onTree.size/(targetH/pitch)));
  // One screen wide at a reading zoom, so the rest of the chart is vertical pages.
  const cap=vw<700?vw*0.98:vw*1.9;
  const maxRow=Math.max(sample.w*3, Math.min(cap, Math.max(cap*0.92, colsWanted*(sample.w+6))));
  const gapX=compact?4:6;
  const gapY=compact?4:5;
  const bandGap=compact?10:14;
  const pos={};
  function packGroups(groups, y){
    let x=0, rowH=0;
    function wrap(){
      if(!rowH){x=0; return;}
      y+=rowH+gapY;
      x=0; rowH=0;
    }
    groups.forEach(ids=>{
      if(!ids.length) return;
      const boxes=ids.map(id=>{const b=nodeBox(id); return {id,w:b.w,h:b.h};});
      const gw=boxes.reduce((s,b)=>s+b.w,0)+gapX*Math.max(0, boxes.length-1);
      const placeOne=(b)=>{
        if(x>0&&x+b.w>maxRow) wrap();
        pos[b.id]={x:x+b.w/2, y:y+b.h/2};
        x+=b.w+gapX;
        rowH=Math.max(rowH, b.h);
      };
      if(gw>maxRow){
        if(x>0) wrap();
        boxes.forEach(placeOne);
        wrap();
        return;
      }
      if(x>0&&x+gw>maxRow) wrap();
      boxes.forEach(b=>{
        pos[b.id]={x:x+b.w/2, y:y+b.h/2};
        x+=b.w+gapX;
        rowH=Math.max(rowH, b.h);
      });
      x+=gapX;
    });
    if(rowH) y+=rowH;
    return y;
  }
  const depthList=[...new Set([...onTree].map(id=>depth[id]||0))].sort((a,b)=>a-b);
  let yCursor=0, maxD=0;
  depthList.forEach(d=>{
    maxD=Math.max(maxD, d);
    const ids=[...onTree].filter(id=>(depth[id]||0)===d);
    let groups;
    if(d===0){
      groups=[ids.slice().sort(byTime)];
    }else{
      const grouped=new Map();
      ids.forEach(id=>{
        const par=primary[id];
        if(!grouped.has(par)) grouped.set(par, []);
        grouped.get(par).push(id);
      });
      const order=[...grouped.keys()].sort((a,b)=>((pos[a]&&pos[a].x)||0)-((pos[b]&&pos[b].x)||0));
      groups=[];
      order.forEach(par=>{
        const g=grouped.get(par).slice().sort(byTime);
        if(g.length) groups.push(g);
      });
    }
    yCursor=packGroups(groups, yCursor);
    yCursor+=bandGap;
  });
  let maxY=0, treeN=onTree.size;
  onTree.forEach(id=>{ if(pos[id]&&pos[id].y>maxY) maxY=pos[id].y; });
  const looseCols=Math.max(4, Math.floor(maxRow/((sample.w||90)+gapX)));
  const base=maxY+sample.h+bandGap*1.4;
  loose.sort(byTime);
  loose.forEach((id,i)=>{
    const b=nodeBox(id);
    const col=i%looseCols;
    const row=Math.floor(i/looseCols);
    pos[id]={x:col*(b.w+gapX)+b.w/2, y:base+row*(b.h+gapY)+b.h/2};
  });
  const ROW=pitch;
  let known=0, est=0;
  const period=periodEarly;
  periodIds.forEach(id=>{
    if(period[id].estimated) est++; else known++;
  });
  return {pos, depth, primary, kids, roots, loose, maxD, treeN, known, est, ROW, period, mastersOf, box:boxOf};
}
function drawTree(){
  layoutLock=true;
  if(layoutAnim){cancelAnimationFrame(layoutAnim); layoutAnim=0;}
  state.mode='tree';
  if(cy) cy.autoungrabify(true);
  const compact=treeCompact();
  const model=buildPedigree(compact);
  const variant=state.treeVariant||'era';
  const nodes=[], edges=[];
  Object.keys(model.pos).forEach(id=>{
    const p=byId[id];
    const info=model.period[id];
    const label=variant==='active'?(p.name+'\n'+(info.estimated?info.label+' · 估':info.label)):p.name;
    const box=model.box[id]||{w:80,h:32};
    nodes.push({classes:'tree'+(info.estimated?' est':''), data:{
      id:id, label:label, labelW:box.w, eraColor:ERA_COLOR[info.era]||'#a8a29e', gen:p.generation||0, color:genColor(p.generation), deg:p._deg
    }, position:model.pos[id]});
  });
  if(model.loose.length){
    const y=Math.min(...model.loose.map(id=>model.pos[id].y))-model.ROW*0.55;
    nodes.push({classes:'tree axis', data:{id:'loosehead', label:'无师承，但有其他关系', w:220, h:28, eraColor:'#a8a29e'}, position:{x:110, y:y}});
  }
  const seen=new Set();
  R.forEach(r=>{
    if(r.type!=='master_disciple') return;
    if(!model.pos[r.from]||!model.pos[r.to]) return;
    if($('#onlyDoc').checked&&r.confidence!=='documented') return;
    const extra=model.primary[r.to]!==r.from;
    const id=(extra?'x':'t')+r.id;
    if(seen.has(id)) return;
    seen.add(id);
    edges.push({classes:extra?'extra':'', data:{id:id, source:r.from, target:r.to, type:'master_disciple', conf:r.confidence, detail:r.detail}});
  });
  cy.minZoom(0.05); cy.maxZoom(3);
  cy.startBatch(); cy.elements().remove();
  cy.add(nodes); cy.add(edges);
  cy.endBatch();
  const treePeople=model.treeN, looseN=model.loose.length;
  state.treeStats={generations:model.maxD+1, tree:treePeople, loose:looseN, known:model.known, est:model.est};
  $('#stat').textContent='家谱 '+state.treeStats.generations+' 层 · 树上 '+treePeople+' 人 · 无师承 '+looseN+' 人 · 活跃时期有生卒 '+model.known+' · 按代数估计 '+model.est+'（全库 '+P.length+' 人）';
  layoutLock=false;
  if(!(state.focus&&cy.getElementById(state.focus).length)) openTreeView();
  paintRail();
  syncZoomSlider();
  updateModeTabs();
}
function paintRail(){
  const rail=$('#eraRail');
  if(!rail) return;
  rail.hidden=true;
  rail.innerHTML='';
}
function openTreeView(){
  const nodes=cy.nodes().filter(n=>!n.hasClass('axis'));
  cy.minZoom(0.04); cy.maxZoom(3);
  if(!nodes.length){cy.fit(undefined, 24); paintRail(); syncZoomSlider(); return;}
  const bb=nodes.boundingBox();
  const padX=treeCompact()?12:20;
  const zFitW=(cy.width()-padX*2)/Math.max(1, bb.w);
  // Names stay readable. On a phone the width fits the screen; on a desktop
  // the chart is about two pages wide and three tall, so the opening page
  // does not shrink the whole tree into specks.
  let z=cy.width()<700?Math.min(1.08, Math.max(0.8, zFitW)):Math.min(1.02, Math.max(0.9, zFitW));
  cy.zoom(z);
  cy.pan({x:padX-bb.x1*z, y:14-bb.y1*z});
  paintRail();
  syncZoomSlider();
}
function canonView(view){
  if(view==='2d'||view==='star2d'||view==='nebula') return 'nebula';
  if(view==='3d'||view==='star3d') return 'network';
  if(view==='tree'||view==='pedigree'||view==='lineage') return 'tree';
  if(view==='graph'||!view) return 'graph';
  return view;
}
function route(){
  const raw=location.hash.replace(/^#/,'');
  const h=raw||'tree';
  const parts=h.split('/');
  const kind=canonView(parts[0]);
  const arg=parts[1];
  const section=(kind==='nebula'||kind==='network'||kind==='tree'||kind==='graph')?'graph':(['people','relations','about'].includes(kind)?kind:'graph');
  document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!=='view-'+section);
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===section));
  if(section!=='graph'){updateModeTabs();return;}
  cy.resize();
  if(arg&&byId[arg]&&!byId[arg]._linked){
    state.mode='network';
    state.focus=arg;
    $('#mode').value='network';
    syncMode();
    drawNetwork();
    renderPanel(arg);
    updateModeTabs();
    return;
  }
  if(kind==='nebula'){
    state.mode='nebula';
    $('#mode').value='nebula';
    syncMode();
    drawNebula();
    if(arg&&byId[arg]){state.focus=arg; highlight(arg,true); renderPanel(arg);}
    updateModeTabs();
    return;
  }
  if(kind==='tree'){
    state.mode='tree';
    if(arg==='era'||arg==='active') state.treeVariant=arg;
    else if(!arg) state.treeVariant='era';
    $('#mode').value='tree';
    syncMode();
    drawTree();
    if(arg&&byId[arg]){state.focus=arg; highlight(arg,true); renderPanel(arg);}
    updateModeTabs();
    return;
  }
  if(kind==='network'){
    state.mode='network';
    $('#mode').value='network';
    syncMode();
    drawNetwork();
    if(arg&&byId[arg]){state.focus=arg; highlight(arg,true); renderPanel(arg);}
    updateModeTabs();
    return;
  }
  if(arg&&byId[arg]){
    state.mode='ego';
    state.focus=arg;
    $('#mode').value='ego';
    syncMode();
    drawEgo(arg);
    renderPanel(arg);
    updateModeTabs();
    return;
  }
  if(state.mode!=='network'){
    resetGlobal();
  }
  updateModeTabs();
  paintRail();
}
// ---- tables
let psort={k:'generation',d:1},rsort={k:'type',d:1};
function renderTables(){
  P.forEach(p=>{p._masters=adj[p.id].filter(r=>r.type==='master_disciple'&&r.to===p.id).map(r=>byId[r.from].name).join('、');p._ndis=adj[p.id].filter(r=>r.type==='master_disciple'&&r.from===p.id).length;});
  R.forEach(r=>{r._fromName=labelOf(byId[r.from]);r._toName=labelOf(byId[r.to]);});
  const drawP=()=>{
    const v=$('#pq').value.trim(),g=$('#pgen').value;
    let rows=P.filter(p=>(!v||(p._search+' '+(p.notes||[]).join(' ')).includes(v))&&(!g||String(p.generation)===g));
    const key={name:p=>p.name,generation:p=>p.generation||99,zibei:p=>p.zibei||'',birth:p=>p.birth||9999,death:p=>p.death||9999,masters:p=>p._masters,ndis:p=>p._ndis,notes:p=>(p.notes||[]).join('')}[psort.k]||(p=>p.name);
    rows.sort((a,b)=>{const x=key(a),y=key(b);return (x<y?-1:x>y?1:a.name.localeCompare(b.name,'zh'))*psort.d;});
    $('#pcount').textContent=rows.length+' 人';
    $('#ptable tbody').innerHTML=rows.map(p=>'<tr><td><a href="#graph/'+p.id+'">'+esc(labelOf(p))+'</a>'+(p.aliases.length?'<br><small class="muted">'+esc(p.aliases.join('、'))+'</small>':'')+'</td><td>'+(p.generation||'')+'</td><td>'+(p.zibei||'')+'</td><td>'+(p.birth||'')+'</td><td>'+(p.death||'')+'</td><td>'+esc(p._masters)+'</td><td>'+(p._ndis||'')+'</td><td class="notes">'+esc((p._linked?[]:['没有任何关系']).concat(p.notes||[]).join('；'))+'</td><td>'+(p.wiki_url?'<a href="'+esc(p.wiki_url)+'" target="_blank" rel="noopener">维基</a> ':'')+srcLinks(p.sources)+'</td></tr>').join('');
  };
  const drawR=()=>{
    const v=$('#rq').value.trim(),t=$('#rtype').value,c=$('#rconf').value;
    let rows=R.filter(r=>(!t||r.type===t)&&(!c||r.confidence===c)&&(!v||(r._fromName+' '+r._toName+' '+r.detail+' '+(r.notes||[]).join(' ')).includes(v)));
    const key={type:r=>r.type,fromName:r=>r._fromName,toName:r=>r._toName,detail:r=>r.detail,confidence:r=>r.confidence}[rsort.k];
    rows.sort((a,b)=>{const x=key(a),y=key(b);return (x<y?-1:x>y?1:0)*rsort.d;});
    $('#rcount').textContent=rows.length+' 条';
    const lim=rows.slice(0,3000);
    $('#rtable tbody').innerHTML=lim.map(r=>'<tr><td>'+TYPE_CN[r.type]+'</td><td><a href="#graph/'+r.from+'">'+esc(r._fromName)+'</a></td><td><a href="#graph/'+r.to+'">'+esc(r._toName)+'</a></td><td class="notes">'+esc(r.detail)+(r.notes&&r.notes.length?'<br><span class="muted">'+esc(r.notes.join('；'))+'</span>':'')+'</td><td><span class="tag'+(r.confidence==='disputed'?' dis':'')+'">'+(CONF_CN[r.confidence]||'')+'</span></td><td>'+srcLinks(r.sources)+'</td></tr>').join('');
  };
  const pgenSel=$('#pgen');
  ['#pq','#pgen'].forEach(s=>$(s).addEventListener('input',drawP));
  ['#rq','#rtype','#rconf'].forEach(s=>$(s).addEventListener('input',drawR));
  const sortable=(tbl,st,draw)=>document.querySelectorAll(tbl+' th[data-k]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.k;st.d=st.k===k?-st.d:1;st.k=k;document.querySelectorAll(tbl+' th').forEach(x=>x.classList.remove('asc','desc'));th.classList.add(st.d>0?'asc':'desc');draw();}));
  sortable('#ptable',psort,drawP);sortable('#rtable',rsort,drawR);
  drawP();drawR();
}
function renderSources(){
  const c={};
  P.forEach(p=>(p.sources||[]).forEach(u=>c[u]=(c[u]||0)+1));
  R.forEach(r=>(r.sources||[]).forEach(u=>c[u]=(c[u]||0)+1));
  const arr=Object.entries(c).sort((a,b)=>b[1]-a[1]);
  const nice=u=>{try{const x=new URL(u);if(x.hostname.endsWith('wikipedia.org'))return '维基百科：'+decodeURIComponent(x.pathname.split('/').pop()).replace(/_/g,' ');return x.hostname+decodeURIComponent(x.pathname);}catch(e){return u;}};
  $('#sourceList').innerHTML=arr.map(([u,n])=>'<li><a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(nice(u))+'</a> <span class="muted">('+n+')</span></li>').join('');
  const gens=P.map(p=>p.generation).filter(Boolean);
  const hidden=P.filter(p=>!p._linked).length;
  const shownN=P.length-hidden;
  $('#buildinfo').textContent='共收录 '+P.length+' 人、'+R.length+' 条关系，图中显示 '+shownN+' 人。另有 '+hidden+' 人没有任何关系，三张图都不画出。有关系的小团体也会画出。覆盖第 '+Math.min(...gens)+'–'+Math.max(...gens)+' 代。数据整理日期：2026-11-11。';
  const fc=$('#footcount'); if(fc) fc.textContent='图中 '+shownN+' 人（全库 '+P.length+' 人、'+R.length+' 条关系）';
  const hn=$('#hiddenNote'); if(hn) hn.textContent='没有任何关系、故不画出：'+hidden+' 人。';
  const ha=$('#hiddenAbout'); if(ha) ha.textContent='目前是 '+hidden+' 人。';
}
})();
