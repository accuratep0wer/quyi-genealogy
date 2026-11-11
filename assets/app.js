(function(){
'use strict';
const TYPE_CN={master_disciple:'师徒',other:'代拉/引保代等',kin:'亲缘',marriage:'姻缘'};
const CONF_CN={documented:'有记载',disputed:'存疑'};
const GEN_COLORS=['#7f1d1d','#9a3412','#b45309','#a16207','#4d7c0f','#047857','#0e7490','#1d4ed8','#6d28d9','#a21caf','#be185d','#475569'];
const genColor=g=>g?GEN_COLORS[(g-1)%GEN_COLORS.length]:'#9ca3af';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let P=[],R=[],L={},byId={},cy=null,state={mode:'network',focus:null,expanded:false};
let expanding=false,expandTimer=null;
const adj={};
const Z_MIN=0.03,Z_MAX=32;
let zoomFromSlider=false;

Promise.all(['data/people.json','data/relations.json','data/layout.json'].map(u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u);return r.json()})))
.then(([p,r,l])=>{P=p;R=r;L=l;init();}).catch(e=>{$('#cy').innerHTML='<p style="padding:20px">数据加载失败：'+esc(e.message)+'</p>';});

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
    if(cnt[p.name]>1){const m=adj[p.id].find(r=>r.type==='master_disciple'&&r.to===p.id);p._label=p.name+(m?'（'+byId[m.from].name+'徒）':p.generation?'（第'+p.generation+'代）':'（同名）');}
    p._search=[p.name].concat(p.aliases||[]).join(' ');
  });
  const gens=[...new Set(P.map(p=>p.generation).filter(Boolean))].sort((a,b)=>a-b);
  const gmin=$('#gmin'),gmax=$('#gmax'),pgen=$('#pgen');
  gens.forEach(g=>{gmin.add(new Option(g,g));gmax.add(new Option(g,g));pgen.add(new Option('第'+g+'代',g));});
  gmin.value=gens[0];gmax.value=gens[gens.length-1];
  $('#genLegend').innerHTML='代数颜色：'+gens.map(g=>'<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+genColor(g)+';vertical-align:middle;margin:0 2px 0 6px"></span>'+g).join('');
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
      {selector:'edge',style:{'width':1.2,'line-color':'#9a9a9a','curve-style':'haystack','opacity':0.55}},
      {selector:'edge[type = "master_disciple"]',style:{'curve-style':'straight','target-arrow-shape':'triangle','target-arrow-color':'#9a9a9a','arrow-scale':0.7}},
      {selector:'edge[type = "kin"]',style:{'line-color':'#c0392b','line-style':'dashed','width':2,'opacity':0.85}},
      {selector:'edge[type = "marriage"]',style:{'line-color':'#8e44ad','line-style':'dotted','width':3,'opacity':0.9}},
      {selector:'edge[type = "other"]',style:{'line-color':'#16a085','line-style':'dashed','line-dash-pattern':[8,3,2,3],'width':2,'opacity':0.85}},
      {selector:'edge[conf = "disputed"]',style:{'line-color':'#e67e22','target-arrow-color':'#e67e22','opacity':0.9}},
      {selector:'.faded',style:{'opacity':0.07,'text-opacity':0}},
      {selector:'node.hl',style:{'border-width':3,'border-color':'#111','min-zoomed-font-size':0,'z-index':10}},
      {selector:'node.nb',style:{'min-zoomed-font-size':0,'z-index':9}},
      {selector:'edge.hl',style:{'opacity':1,'width':2.6,'z-index':9}},
      {selector:'.alllabels',style:{'min-zoomed-font-size':0}},
      {selector:'node.local',style:{'min-zoomed-font-size':0,'text-opacity':1}},
      {selector:'node.parked',style:{'display':'none'}},
      {selector:'edge.parked',style:{'display':'none'}}
    ],
    layout:{name:'preset'}
  });
  cy.on('tap','node',e=>selectPerson(e.target.id(),false));
  cy.on('tap',e=>{if(e.target===cy) clearHL();});
  cy.on('mouseover','edge',e=>{const d=e.target.data();e.target.style('label',(TYPE_CN[d.type]||'')+(d.detail?'：'+d.detail:'')+(d.conf==='disputed'?'（存疑）':''));e.target.style({'font-size':11,'text-background-color':'#fff','text-background-opacity':0.9,'text-background-padding':2});});
  cy.on('mouseout','edge',e=>e.target.removeStyle('label'));
  cy.on('zoom',()=>{syncZoomSlider();scheduleExpand();});
  drawNetwork();
}
function filters(){
  const types=[...document.querySelectorAll('.types input[data-type]')].filter(i=>i.checked).map(i=>i.dataset.type);
  return {types:new Set(types),dis:$('#showDisputed').checked,gmin:+$('#gmin').value,gmax:+$('#gmax').value};
}
function personOk(p,f){return !p.generation||(p.generation>=f.gmin&&p.generation<=f.gmax);}
function relOk(r,f){return f.types.has(r.type)&&(f.dis||r.confidence!=='disputed');}
function drawNetwork(){
  state.expanded=false;
  const f=filters();
  const rels=R.filter(r=>relOk(r,f)&&personOk(byId[r.from],f)&&personOk(byId[r.to],f));
  const used=new Set();rels.forEach(r=>{used.add(r.from);used.add(r.to);});
  const nodes=P.filter(p=>personOk(p,f)&&(used.has(p.id)||(p.role!=='relative'&&f.types.has('master_disciple'))));
  cy.startBatch();cy.elements().remove();
  cy.add(nodes.map(nodeData));cy.add(rels.map(edgeData));
  cy.endBatch();
  cy.layout({name:'preset',fit:true,padding:20}).run();
  stat(nodes.length,rels.length);
  if(state.focus&&cy.getElementById(state.focus).length) highlight(state.focus,false);
  updateLayoutButtons();
}
function egoSet(id){
  const f=filters(),dd=+$('#depthDown').value,du=+$('#depthUp').value;
  const keep=new Set([id]),rels=new Set();
  // up
  let front=[id];
  for(let d=0;d<du&&front.length;d++){const nx=[];front.forEach(x=>adj[x].forEach(r=>{if(r.type==='master_disciple'&&r.to===x&&relOk(r,f)){rels.add(r);if(!keep.has(r.from)){keep.add(r.from);nx.push(r.from);}}}));front=nx;}
  front=[id];
  for(let d=0;d<dd&&front.length;d++){const nx=[];front.forEach(x=>adj[x].forEach(r=>{if(r.type==='master_disciple'&&r.from===x&&relOk(r,f)){rels.add(r);if(!keep.has(r.to)){keep.add(r.to);nx.push(r.to);}}}));front=nx;}
  adj[id].forEach(r=>{if(relOk(r,f)){rels.add(r);keep.add(r.from);keep.add(r.to);}});
  // edges among kept
  R.forEach(r=>{if(keep.has(r.from)&&keep.has(r.to)&&relOk(r,f))rels.add(r);});
  return {nodes:[...keep].map(k=>byId[k]),rels:[...rels]};
}
function nodeSize(p){return Math.max(12,Math.min(70,10+Math.sqrt(p._deg||1)*6));}
function labelFont(p){return p._deg>=15?16:(p._deg<6?10:12);}
function labelRadius(p){
  const font=labelFont(p);
  const chars=[...labelOf(p)].length;
  const halfW=chars*font*0.55+8;
  const halfH=nodeSize(p)/2+font+8;
  return Math.max(halfW, halfH*0.92);
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
function spreadPositions(ids){
  const pos={};
  ids.forEach((id,i)=>{
    const n=cy.getElementById(id);
    const p=n.nonempty&&n.length?n.position():{x:0,y:0};
    pos[id]={x:p.x+(i%9)*0.2,y:p.y+((i*3)%9)*0.2};
  });
  relax(pos,ids,[]);
  return pos;
}
function nodesInView(){
  const e=cy.extent(),ids=[];
  cy.nodes().forEach(n=>{
    if(n.hasClass('parked')) return;
    const p=n.position();
    if(p.x>=e.x1-30&&p.x<=e.x2+30&&p.y>=e.y1-30&&p.y<=e.y2+30) ids.push(n.id());
  });
  return ids;
}
function dominantHub(ids){
  const set=new Set(ids);
  let best=null,score=-1;
  ids.forEach(id=>{
    let c=0;
    (adj[id]||[]).forEach(r=>{if(r.type==='master_disciple'&&r.from===id&&set.has(r.to)) c++;});
    if(c>score){score=c;best=id;}
  });
  return score>=6?best:null;
}
function isClumped(ids){
  if(ids.length<8) return false;
  const sample=ids.length>160?ids.filter((_,i)=>i%2===0):ids;
  let close=0;
  for(let i=0;i<sample.length;i++){
    const A=cy.getElementById(sample[i]).position();
    let best=1e9;
    for(let j=0;j<sample.length;j++) if(i!==j){
      const B=cy.getElementById(sample[j]).position();
      const d=Math.hypot(A.x-B.x,A.y-B.y);
      if(d<best) best=d;
    }
    const need=labelRadius(byId[sample[i]])*1.7;
    if(best<need) close++;
  }
  return close/sample.length>0.45;
}
function neighborhoodIds(id,down,up){
  const f=filters(),keep=new Set([id]);
  let front=[id];
  for(let d=0;d<up&&front.length;d++){
    const nx=[];
    front.forEach(x=>(adj[x]||[]).forEach(r=>{
      if(r.type==='master_disciple'&&r.to===x&&relOk(r,f)&&!keep.has(r.from)&&cy.getElementById(r.from).length){keep.add(r.from);nx.push(r.from);}
    }));
    front=nx;
  }
  front=[id];
  for(let d=0;d<down&&front.length;d++){
    const nx=[];
    front.forEach(x=>(adj[x]||[]).forEach(r=>{
      if(r.type==='master_disciple'&&r.from===x&&relOk(r,f)&&!keep.has(r.to)&&cy.getElementById(r.to).length){keep.add(r.to);nx.push(r.to);}
    }));
    front=nx;
  }
  (adj[id]||[]).forEach(r=>{if(relOk(r,f)){if(cy.getElementById(r.from).length) keep.add(r.from); if(cy.getElementById(r.to).length) keep.add(r.to);}});
  return [...keep];
}
function present(centerId){
  const eles=cy.nodes('.local');
  cy.fit(eles.length?eles:undefined,44);
  const minZ=1.2;
  if(cy.zoom()<minZ&&centerId){
    const n=cy.getElementById(centerId);
    if(n.length){cy.center(n);zoomAtCenter(minZ);}
  }
  syncZoomSlider();
}
function applySpread(hubId,ids){
  const idset=new Set(ids);
  idset.add(hubId);
  const list=[...idset].filter(id=>byId[id]&&cy.getElementById(id).length);
  const rels=R.filter(r=>idset.has(r.from)&&idset.has(r.to));
  const hub=hubId&&idset.has(hubId)?hubId:list[0];
  const useRadial=dominantHub(list)===hub||((childrenCount(hub,idset))>=6);
  let local;
  if(useRadial) local=layoutRadial(hub,list,rels);
  else local=spreadPositions(list);
  const originNode=cy.getElementById(hub);
  const origin=originNode.length?originNode.position():{x:0,y:0};
  cy.startBatch();
  cy.nodes().forEach(n=>{
    const p=local[n.id()];
    if(p){
      n.removeClass('parked'); n.addClass('local');
      n.position(useRadial?{x:origin.x+p.x,y:origin.y+p.y}:p);
    }else{
      n.addClass('parked'); n.removeClass('local');
    }
  });
  cy.edges().forEach(e=>e.toggleClass('parked',e.source().hasClass('parked')||e.target().hasClass('parked')));
  cy.endBatch();
  state.expanded=true;
  present(hub);
  const shown=cy.nodes('.local');
  stat(shown.length, cy.edges().not('.parked').length);
  if(state.focus&&cy.getElementById(state.focus).length) highlight(state.focus,false);
  updateLayoutButtons();
}
function childrenCount(id,set){
  let c=0;
  (adj[id]||[]).forEach(r=>{if(r.type==='master_disciple'&&r.from===id&&(!set||set.has(r.to))) c++;});
  return c;
}
function hubInView(ids){
  const e=cy.extent(), cx=(e.x1+e.x2)/2, cy0=(e.y1+e.y2)/2;
  let best=null,score=-1;
  ids.forEach(id=>{
    const n=cy.getElementById(id); if(!n.length) return;
    const p=n.position();
    const dist=Math.hypot(p.x-cx,p.y-cy0);
    const s=(childrenCount(id)+1)/(1+dist/70);
    if(s>score){score=s;best=id;}
  });
  return best;
}
function expandVisible(){
  if(expanding) return;
  clearTimeout(expandTimer);
  if(state.mode==='ego'&&state.focus){drawEgo(state.focus);return;}
  expanding=true;
  try{
    let vis=nodesInView();
    if(!vis.length&&state.focus) vis=[state.focus];
    const hub=(state.focus&&vis.includes(state.focus))?state.focus:(hubInView(vis)||vis[0]);
    if(!hub) return;
    let ids;
    if(childrenCount(hub)>=6) ids=neighborhoodIds(hub,2,1);
    else {
      const set=new Set(vis);
      vis.forEach(id=>{(adj[id]||[]).forEach(r=>{
        if(set.size>=120||!relOk(r,filters())) return;
        if(cy.getElementById(r.from).length) set.add(r.from);
        if(cy.getElementById(r.to).length) set.add(r.to);
      });});
      ids=[...set];
    }
    if(ids.length) applySpread(hub,ids);
  } finally { expanding=false; }
}
function scheduleExpand(){
  if(expanding||state.expanded||state.mode!=='network') return;
  clearTimeout(expandTimer);
  expandTimer=setTimeout(()=>{
    if(expanding||state.expanded||state.mode!=='network') return;
    if(cy.zoom()<1.15) return;
    const vis=nodesInView();
    if(vis.length<8||vis.length>320) return;
    if(!isClumped(vis)) return;
    expandVisible();
  },340);
}
function resetGlobal(){
  clearTimeout(expandTimer);
  expanding=true;
  state.mode='network';
  state.expanded=false;
  $('#mode').value='network';
  syncMode();
  if(location.hash.startsWith('#graph/')) history.replaceState(null,'','#graph');
  drawNetwork();
  expanding=false;
  updateLayoutButtons();
}
function updateLayoutButtons(){
  const btn=$('#resetLayout');
  if(btn) btn.disabled=state.mode!=='ego'&&!state.expanded;
}
function drawEgo(id){
  expanding=true;
  clearTimeout(expandTimer);
  const s=egoSet(id);
  const ids=s.nodes.map(p=>p.id);
  const local=layoutRadial(id,ids,s.rels);
  cy.startBatch();cy.elements().remove();
  cy.add(s.nodes.map(p=>{const n=nodeData(p); n.position=local[p.id]||{x:0,y:0}; return n;}));
  cy.add(s.rels.map(edgeData));
  cy.endBatch();
  cy.nodes().addClass('local');
  state.expanded=false;
  present(id);
  stat(s.nodes.length,s.rels.length);
  highlight(id,false);
  updateLayoutButtons();
  expanding=false;
}
function stat(n,e){
  const tag=state.mode==='ego'?' · 聚焦环形谱系':(state.expanded?' · 已局部展开':'');
  $('#stat').textContent='当前显示 '+n+' 人 · '+e+' 条关系（全库 '+P.length+' 人 · '+R.length+' 条）'+tag;
}
function clearHL(){cy.elements().removeClass('faded hl nb');}
function highlight(id,center){
  const n=cy.getElementById(id);if(!n.length)return;
  clearHL();
  const nb=n.closedNeighborhood();
  if(state.mode!=='ego'&&!state.expanded) cy.elements().not(nb).addClass('faded');
  nb.nodes().addClass('nb');n.addClass('hl');n.connectedEdges().addClass('hl');
  if(center) cy.animate({center:{eles:n},zoom:Math.max(cy.zoom(),0.9)},{duration:450});
}
function selectPerson(id,center){
  state.focus=id;
  if(state.mode==='ego'){drawEgo(id);}else highlight(id,center);
  renderPanel(id);
  if(location.hash!=='#graph/'+id) history.replaceState(null,'','#graph/'+id);
}
function plink(id){const p=byId[id];return '<span class="pl" data-id="'+id+'">'+esc(labelOf(p))+'</span>';}
function srcLinks(arr){return (arr||[]).map((u,i)=>'<a href="'+esc(u)+'" target="_blank" rel="noopener" title="'+esc(u)+'">['+(i+1)+']</a>').join(' ');}
function relLine(r,other){
  return '<li>'+plink(other)+(r.detail?' <small>'+esc(r.detail)+'</small>':'')+(r.confidence==='disputed'?'<span class="tag dis">存疑</span>':'')+' <small>'+srcLinks(r.sources)+'</small>'+(r.notes&&r.notes.length?'<br><small class="muted">'+esc(r.notes.join('；'))+'</small>':'')+'</li>';
}
function renderPanel(id){
  const p=byId[id];const rs=adj[id];
  const masters=rs.filter(r=>r.type==='master_disciple'&&r.to===id);
  const dis=rs.filter(r=>r.type==='master_disciple'&&r.from===id);
  const sib=new Map();masters.forEach(m=>adj[m.from].forEach(r=>{if(r.type==='master_disciple'&&r.from===m.from&&r.to!==id)sib.set(r.to,1);}));
  const kin=rs.filter(r=>r.type==='kin'),mar=rs.filter(r=>r.type==='marriage'),oth=rs.filter(r=>r.type==='other');
  const sec=(t,arr,fn)=>arr.length?'<h3>'+t+'（'+arr.length+'）</h3><ul>'+arr.map(fn).join('')+'</ul>':'';
  const yrs=(p.birth||p.death)?(p.birth||'?')+'–'+(p.death||''):'';
  $('#panel').innerHTML='<h2>'+esc(labelOf(p))+'</h2>'+
   '<div class="meta">'+(p.generation?'第'+p.generation+'代'+(p.zibei?'·“'+p.zibei+'”字辈':''):'代数不详')+(p.gen_source?'<span class="tag">'+esc(p.gen_source)+'</span>':'')+(yrs?' · '+yrs:'')+(p.role==='relative'?' · 非谱系内亲属':'')+'</div>'+
   '<div class="panel-actions"><button type="button" id="egoBtn">'+(state.mode==='ego'?'回到全网络':'聚焦此人的师承子图')+'</button>'+
   '<button type="button" class="feedback-btn" id="panelFeedback">提交修正</button></div>'+
   (p.aliases&&p.aliases.length?'<div>别名/本名：'+esc(p.aliases.join('、'))+'</div>':'')+
   (p.notes&&p.notes.length?'<div class="muted" style="margin-top:6px">'+p.notes.map(esc).join('<br>')+'</div>':'')+
   sec('师父',masters,r=>relLine(r,r.from))+
   sec('徒弟',dis,r=>relLine(r,r.to))+
   sec('代拉 / 引保代 / 口盟等',oth,r=>relLine(r,r.from===id?r.to:r.from))+
   sec('亲缘',kin,r=>relLine(r,r.from===id?r.to:r.from))+
   sec('姻缘',mar,r=>relLine(r,r.from===id?r.to:r.from))+
   (sib.size?'<h3>同门（'+sib.size+'）</h3><div style="line-height:1.9">'+[...sib.keys()].map(plink).join('、')+'</div>':'')+
   '<h3>来源</h3><div>'+(p.wiki_url?'<a href="'+esc(p.wiki_url)+'" target="_blank" rel="noopener">维基百科条目</a> ':'')+srcLinks(p.sources)+'</div>';
  $('#egoBtn').onclick=()=>{
    if(state.mode==='ego'){resetGlobal();renderPanel(id);return;}
    state.mode='ego';$('#mode').value='ego';syncMode();state.focus=id;drawEgo(id);renderPanel(id);
  };
  $('#panelFeedback').onclick=()=>openFeedback(id);
}
function syncMode(){document.querySelectorAll('.ego-only').forEach(e=>e.style.display=state.mode==='ego'?'':'none');}
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
  $('#mode').addEventListener('change',e=>{state.mode=e.target.value;syncMode();if(state.mode==='ego'){const id=state.focus||P.find(p=>p.name==='侯宝林').id;selectPerson(id,true);}else{drawNetwork();if(state.focus){highlight(state.focus,true);renderPanel(state.focus);}}});
  ['#depthDown','#depthUp'].forEach(s=>$(s).addEventListener('change',()=>{if(state.mode==='ego'&&state.focus)drawEgo(state.focus);}));
  const refilter=()=>{if(state.mode==='ego'&&state.focus)drawEgo(state.focus);else drawNetwork();};
  ['#gmin','#gmax','#showDisputed'].forEach(s=>$(s).addEventListener('change',refilter));
  document.querySelectorAll('.types input[data-type]').forEach(i=>i.addEventListener('change',refilter));
  $('#fit').onclick=()=>{
    const local=cy.nodes('.local');
    if((state.expanded||state.mode==='ego')&&local.length) cy.fit(local,44);
    else cy.fit(undefined,30);
    syncZoomSlider();
  };
  $('#expand').onclick=()=>expandVisible();
  $('#resetLayout').onclick=()=>resetGlobal();
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
  window.addEventListener('resize',()=>{if(cy) cy.resize();});
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
  const t=Math.log(z/Z_MIN)/Math.log(Z_MAX/Z_MIN);
  return Math.round(Math.min(1,Math.max(0,t))*1000);
}
function zoomFromSliderValue(v){
  return Z_MIN*Math.pow(Z_MAX/Z_MIN,Number(v)/1000);
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
    return name+(r.detail?'·'+r.detail:'')+(r.confidence==='disputed'?'（存疑）':'');
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
function route(){
  const h=location.hash.replace(/^#/,'')||'graph';
  const [view,arg]=h.split('/');
  const v=['graph','people','relations','about'].includes(view)?view:'graph';
  document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!=='view-'+v);
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===v));
  if(v!=='graph') return;
  cy.resize();
  if(arg&&byId[arg]){
    state.mode='ego';
    state.focus=arg;
    $('#mode').value='ego';
    syncMode();
    drawEgo(arg);
    renderPanel(arg);
  } else if(state.mode==='ego'||state.expanded){
    resetGlobal();
  }
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
    $('#ptable tbody').innerHTML=rows.map(p=>'<tr><td><a href="#graph/'+p.id+'">'+esc(labelOf(p))+'</a>'+(p.aliases.length?'<br><small class="muted">'+esc(p.aliases.join('、'))+'</small>':'')+'</td><td>'+(p.generation||'')+'</td><td>'+(p.zibei||'')+'</td><td>'+(p.birth||'')+'</td><td>'+(p.death||'')+'</td><td>'+esc(p._masters)+'</td><td>'+(p._ndis||'')+'</td><td class="notes">'+esc((p.notes||[]).join('；'))+'</td><td>'+(p.wiki_url?'<a href="'+esc(p.wiki_url)+'" target="_blank" rel="noopener">维基</a> ':'')+srcLinks(p.sources)+'</td></tr>').join('');
  };
  const drawR=()=>{
    const v=$('#rq').value.trim(),t=$('#rtype').value,c=$('#rconf').value;
    let rows=R.filter(r=>(!t||r.type===t)&&(!c||r.confidence===c)&&(!v||(r._fromName+' '+r._toName+' '+r.detail+' '+(r.notes||[]).join(' ')).includes(v)));
    const key={type:r=>r.type,fromName:r=>r._fromName,toName:r=>r._toName,detail:r=>r.detail,confidence:r=>r.confidence}[rsort.k];
    rows.sort((a,b)=>{const x=key(a),y=key(b);return (x<y?-1:x>y?1:0)*rsort.d;});
    $('#rcount').textContent=rows.length+' 条';
    const lim=rows.slice(0,3000);
    $('#rtable tbody').innerHTML=lim.map(r=>'<tr><td>'+TYPE_CN[r.type]+'</td><td><a href="#graph/'+r.from+'">'+esc(r._fromName)+'</a></td><td><a href="#graph/'+r.to+'">'+esc(r._toName)+'</a></td><td class="notes">'+esc(r.detail)+(r.notes&&r.notes.length?'<br><span class="muted">'+esc(r.notes.join('；'))+'</span>':'')+'</td><td>'+(r.confidence==='disputed'?'<span class="tag dis">存疑</span>':'有记载')+'</td><td>'+srcLinks(r.sources)+'</td></tr>').join('');
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
  $('#buildinfo').textContent='共收录 '+P.length+' 人、'+R.length+' 条关系，覆盖第 '+Math.min(...gens)+'–'+Math.max(...gens)+' 代。数据整理日期：2026-11-11。';
}
})();
