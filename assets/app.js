(function(){
'use strict';
const TYPE_CN={master_disciple:'师徒',other:'代拉/引保代等',kin:'亲缘',marriage:'姻缘'};
const CONF_CN={documented:'有记载',disputed:'存疑'};
const GEN_COLORS=['#7f1d1d','#9a3412','#b45309','#a16207','#4d7c0f','#047857','#0e7490','#1d4ed8','#6d28d9','#a21caf','#be185d','#475569'];
const genColor=g=>g?GEN_COLORS[(g-1)%GEN_COLORS.length]:'#9ca3af';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let P=[],R=[],L={},byId={},cy=null,state={mode:'network',focus:null};
const adj={};

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
  cy=cytoscape({container:$('#cy'),wheelSensitivity:0.25,minZoom:0.03,maxZoom:4,textureOnViewport:true,hideEdgesOnViewport:false,
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
      {selector:'.alllabels',style:{'min-zoomed-font-size':0}}
    ],
    layout:{name:'preset'}
  });
  cy.on('tap','node',e=>selectPerson(e.target.id(),false));
  cy.on('tap',e=>{if(e.target===cy) clearHL();});
  cy.on('mouseover','edge',e=>{const d=e.target.data();e.target.style('label',(TYPE_CN[d.type]||'')+(d.detail?'：'+d.detail:'')+(d.conf==='disputed'?'（存疑）':''));e.target.style({'font-size':11,'text-background-color':'#fff','text-background-opacity':0.9,'text-background-padding':2});});
  cy.on('mouseout','edge',e=>e.target.removeStyle('label'));
  drawNetwork();
}
function filters(){
  const types=[...document.querySelectorAll('.types input[data-type]')].filter(i=>i.checked).map(i=>i.dataset.type);
  return {types:new Set(types),dis:$('#showDisputed').checked,gmin:+$('#gmin').value,gmax:+$('#gmax').value};
}
function personOk(p,f){return !p.generation||(p.generation>=f.gmin&&p.generation<=f.gmax);}
function relOk(r,f){return f.types.has(r.type)&&(f.dis||r.confidence!=='disputed');}
function drawNetwork(){
  const f=filters();
  const rels=R.filter(r=>relOk(r,f)&&personOk(byId[r.from],f)&&personOk(byId[r.to],f));
  const used=new Set();rels.forEach(r=>{used.add(r.from);used.add(r.to);});
  const nodes=P.filter(p=>personOk(p,f)&&(used.has(p.id)||(p.role!=='relative'&&f.types.has('master_disciple'))));
  cy.startBatch();cy.elements().remove();
  cy.add(nodes.map(nodeData));cy.add(rels.map(edgeData));
  cy.endBatch();
  cy.layout({name:'preset',fit:true,padding:20}).run();
  stat(nodes.length,rels.length);
  if(state.focus&&cy.getElementById(state.focus).length) highlight(state.focus,true);
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
function drawEgo(id){
  const s=egoSet(id);
  cy.startBatch();cy.elements().remove();
  cy.add(s.nodes.map(p=>{const n=nodeData(p);delete n.position;return n;}));cy.add(s.rels.map(edgeData));cy.endBatch();
  runForce(true);
  stat(s.nodes.length,s.rels.length);
  highlight(id,false);
}
function runForce(fit){
  const n=cy.nodes().length;
  cy.layout({name:'cose',animate:n<400,animationDuration:700,fit:fit!==false,padding:30,randomize:n<400,nodeRepulsion:()=>n>800?4500:9000,idealEdgeLength:()=>n>800?40:70,edgeElasticity:()=>100,gravity:n>800?0.6:1,numIter:n>800?600:1500,nodeDimensionsIncludeLabels:false}).run();
}
function stat(n,e){$('#stat').textContent='当前显示 '+n+' 人 · '+e+' 条关系（全库 '+P.length+' 人 · '+R.length+' 条）';}
function clearHL(){cy.elements().removeClass('faded hl nb');}
function highlight(id,center){
  const n=cy.getElementById(id);if(!n.length)return;
  clearHL();
  const nb=n.closedNeighborhood();
  if(state.mode!=='ego') cy.elements().not(nb).addClass('faded');
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
   (p.aliases&&p.aliases.length?'<div>别名/本名：'+esc(p.aliases.join('、'))+'</div>':'')+
   (p.notes&&p.notes.length?'<div class="muted" style="margin-top:6px">'+p.notes.map(esc).join('<br>')+'</div>':'')+
   sec('师父',masters,r=>relLine(r,r.from))+
   sec('徒弟',dis,r=>relLine(r,r.to))+
   sec('代拉 / 引保代 / 口盟等',oth,r=>relLine(r,r.from===id?r.to:r.from))+
   sec('亲缘',kin,r=>relLine(r,r.from===id?r.to:r.from))+
   sec('姻缘',mar,r=>relLine(r,r.from===id?r.to:r.from))+
   (sib.size?'<h3>同门（'+sib.size+'）</h3><div style="line-height:1.9">'+[...sib.keys()].map(plink).join('、')+'</div>':'')+
   '<h3>来源</h3><div>'+(p.wiki_url?'<a href="'+esc(p.wiki_url)+'" target="_blank" rel="noopener">维基百科条目</a> ':'')+srcLinks(p.sources)+'</div>'+
   '<div style="margin-top:10px"><button type="button" id="egoBtn">'+(state.mode==='ego'?'回到全网络':'聚焦此人的师承子图')+'</button></div>';
  $('#egoBtn').onclick=()=>{state.mode=state.mode==='ego'?'network':'ego';$('#mode').value=state.mode;syncMode();if(state.mode==='ego')drawEgo(id);else{drawNetwork();highlight(id,true);}renderPanel(id);};
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
  $('#fit').onclick=()=>cy.fit(undefined,20);
  $('#relayout').onclick=()=>runForce(true);
  $('#labels').addEventListener('change',e=>cy.nodes().toggleClass('alllabels',e.target.checked));
  syncMode();
}
function route(){
  const h=location.hash.replace(/^#/,'')||'graph';
  const [view,arg]=h.split('/');
  const v=['graph','people','relations','about'].includes(view)?view:'graph';
  document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!=='view-'+v);
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===v));
  if(v==='graph'){cy.resize();if(arg&&byId[arg]&&state.focus!==arg){selectPerson(arg,true);} }
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
