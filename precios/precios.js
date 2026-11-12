/* Duracreto MarketView — módulo Estudio de precios (chat Estudio de precios).
 * Viene de «2. Estudio de precios - App/src/Index.html»: misma pantalla y mismas reglas; el login, el encabezado, el tema y los avisos
 * los pone el cascarón (core.js). Servidor: apps-script/Precios.gs (acciones precios.*).
 * Todo va dentro de esta función: sin variables globales; id con prefijo precios-; estilos en precios.css bajo .precios-raiz. */
(function () {
"use strict";
let CTX = null, RAIZ = null, MODEL = null;   // ctx del cascarón, <div class="precios-raiz"> y la sección que hace scroll
const OYENTES = [];                          // eventos que se conectan a RAIZ al montar (no a todo el documento)
const on = (tipo, fn) => OYENTES.push([tipo, fn]);
const NEG = [
  {k:"concreto", l:"Concreto premezclado", u:"m³"},
  {k:"agregados", l:"Agregados", u:"m³"},
  {k:"bloques", l:"Bloques", u:"unidad"},
  {k:"prefabricados", l:"Prefabricados", u:"unidad"}
];
const NEGL = Object.fromEntries(NEG.map(n=>[n.k,n.l]));
const DEF_TRAMOS = ["Categoría I","Categoría II","Categoría III","Categoría IV"];
const MAXT = 4;
const FUENTES = ["Cotización","Cliente (verbal)","Licitación","Factura / orden de compra","Otro"];
const SIN_ANEXO = ["Cliente (verbal)","Otro"];
const newItem = () => ({prod:"", precio:"", vol:"", dcServ:""});
const TEMP_ID = "srv-temp"; // control de temperatura: ya no se elige como producto, se registra como condición
const INICIO_DEF = "concreto|"+"Valle de Sula (SPS)|dc-duracreto-planta-santa-martha";
const cfgN = (k,d) => { const v=Number(S.config?.[k]); return isFinite(v)&&v>0?v:d; };
const TARIFA_KM = () => cfgN("recargoKm",6), RADIO_KM = () => cfgN("radioCobertura",20), PRECIO_BOLSA = () => cfgN("precioBolsa",110);
/* Secciones por rol (12/11/2026). Lo confidencial lo filtra el servidor (Precios.gs); aquí solo se ordena la pantalla.
   visualizador = dirección/IT: ve todo sin cambiar. area = gerente de un negocio: solo su negocio.
   asesor = equipo comercial: registra y ve solo su propio historial (sin comparador). */
const VISTAS = {editor:["comparar","registrar","historial","precios","catalogo"], consulta:["comparar","historial","precios","catalogo"], visualizador:["comparar","historial","precios","catalogo"], area:["comparar","historial","precios"], asesor:["registrar","historial"]};
/** Negocios que esta persona puede ver (los que tienen productos en lo que mandó el servidor). */
const negVis = () => { const v=NEG.filter(n=>(S.productos||[]).some(p=>p.negocio===n.k)); return v.length?v:NEG; };
// Rol "consulta": ve todo como un editor, pero nada se guarda (solo el chat).
const SIN_AUT = "No tienes autorización para hacer modificaciones.";
const soloConsulta = () => ["consulta","visualizador","area"].includes(S.me?.rol);   // ven, pero no guardan nada (salvo el chat)
const CHAT_OWNER = "despana";
const gestionaCot = () => S.me?.usuario===CHAT_OWNER || S.me?.coanfitrion===true;
/* Servicio de construcción sin precio de servicio de Duracreto: se compara contra la lista normal + ISV y sí entra al comparador */
const fueraComp = q => !!q.servicioConstruccion && !q.servLista;
const servLista = r => !!r.serv && !r.servFile;
const VS = "Valle de Sula (SPS)";
const ZONAS_VS = [{z:"San Pedro Sula / La Lima", planta:"dc-duracreto-planta-santa-martha"},{z:"Choloma", planta:"dc-duracreto-planta-jutosa"},{z:"Villanueva", planta:"dc-duracreto-planta-santa-elena"}];
const AVATAR = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#F9D600"/><path d="M12 64c2-11 10-17 20-17s18 6 20 17z" fill="#12130F"/><path d="M27 41h10v8l-5 3-5-3z" fill="#EBC3A0"/><ellipse cx="32" cy="30" rx="12.5" ry="14.5" fill="#F7D9BF"/><path d="M19.2 29c-.8-10 4.6-16.5 12.8-16.5S45.6 19 44.8 29c-1.2-4.6-3.6-7.6-7-8.6-3.4 1.6-8.2 2.2-13.8.6-2.6 1.4-4 4-4.8 8z" fill="#151515"/><path d="M20.4 32c.6 9.6 5.4 13.6 11.6 13.6S43 41.6 43.6 32c-1 3-2.6 4.6-4.4 5.2-1.8-1.6-4.2-2.4-7.2-2.4s-5.4.8-7.2 2.4c-1.8-.6-3.4-2.2-4.4-5.2z" fill="#2A2522" opacity=".88"/><path d="M27.4 36.6c1.6-1.2 7.6-1.2 9.2 0" stroke="#2A2522" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M29.6 39.6q2.4 1.4 4.8 0" stroke="#C98E74" stroke-width="1.3" stroke-linecap="round" fill="none"/><circle cx="27" cy="29" r="1.6" fill="#151515"/><circle cx="37" cy="29" r="1.6" fill="#151515"/><path d="M24.4 25.6q2.6-1.4 5 0M34.6 25.6q2.4-1.4 5 0" stroke="#151515" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>`;
const PALETTE = ["--c2","--c3","--c4","--c5","--c6","--c7","--c1","--c8"];

const S = {
  ready:false, db:null, user:null, uid:null, canEdit:false, canWrite:true, dl:null,
  plantas:[], productos:[], precios:[], cotiz:[], config:{tramos:{}, isv:15},
  view:"comparar",
  f:{neg:"concreto", mercado:"", tramo:1, own:"", ventana:365},
  h:{neg:"", mercado:"", planta:"", prod:"", q:""},
  reg:{neg:"concreto", zona:"", planta:"", otro:"", items:[], isv:false, fecha:today(), cliente:"", proyecto:"", fuente:FUENTES[0], fuenteOtro:"", notas:"", file:null, err:{}, saving:false,
    serv:false, servFile:null, rec:false, recQ:"", recSug:[], recBusy:false, lugar:null, dist:null, distBusy:false, distErr:"", recComp:"", temp:false, tempComp:"", tempBolsas:"", flete:false, fleteComp:"", fleteTP:""},
  me:null, usuarios:[], assets:null, recentOpen:false,
  chat:{open:false, msgs:[], threads:[], sel:null, selMsgs:[], unsub:null, unsubSel:null, sending:false},
  pr:{neg:"concreto", planta:"", desde:today(), nota:"", draft:{}},
  cat:{tab:"productos", neg:"concreto", edit:null, np:{familia:"",nombre:"",esp:"",unidad:"",codigo:""}, paste:"", npl:{nombre:"",ciudad:"",mercado:"",negocios:["concreto"]}},
  drawer:null, names:{}, confirmDel:null
};
try{ const v=localStorage.getItem("mv_precios_vista"); if(v) S.view=v; }catch(e){}

/* ---------- utilidades ---------- */
function today(){ const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = v => (v==null||v==="")?"—":"L "+Number(v).toLocaleString("es-HN",{minimumFractionDigits:2,maximumFractionDigits:2});
const pct = v => (v>0?"+":"")+(v*100).toFixed(1)+"%";
const num = v => { if(v===""||v==null) return null; const n=Number(String(v).replace(/,/g,"")); return isFinite(n)?n:null; };
const fmtDate = s => { if(!s) return "—"; const [y,m,d]=s.split("-"); return `${d}/${m}/${y}`; };
const daysAgo = s => Math.round((Date.parse(today())-Date.parse(s))/864e5);
/* Avisos: los muestra el cascarón (ctx.aviso). El de «sin autorización» no se tapa con otros durante 2.6 s. */
function toast(msg, tipo){ if(msg!==SIN_AUT && (toast._lock||0)>Date.now()) return; if(msg===SIN_AUT){ toast._lock=Date.now()+2600; tipo="error"; } if(CTX) CTX.aviso(msg, tipo); }
const isv = () => Number(S.config.isv ?? 15)/100;
/* Servicio vs. lista: el precio exento se compara contra la lista de Duracreto + ISV. En el comparador (todo sin ISV) equivale a precio / (1 + ISV). */
const sinISV = q => (q.incluyeISV || q.servLista) ? q.precio/(1+isv()) : q.precio;
const tramosDe = neg => { const t=(S.config.tramos||{})[neg]; const arr=Array.isArray(t)&&t.length?t.slice(0,MAXT):[{nombre:"Precio de lista"}]; return arr.map((x,i)=>({nombre:(x&&x.nombre)||DEF_TRAMOS[i], min:x?.min??null, max:x?.max??null})); };
const fmtN = v => Number(v).toLocaleString("es-HN");
const tramoRango = t => (t.min==null&&t.max==null)?"" : t.max==null?`> ${fmtN(t.min-1>0?t.min-1:t.min)}` : t.min==null?`hasta ${fmtN(t.max)}` : `${fmtN(t.min)} – ${fmtN(t.max)}`;
function tramoPorVolumen(neg, v){
  if(v==null) return null; const ts=tramosDe(neg);
  if(ts.length<2||!ts.some(t=>t.min!=null||t.max!=null)) return null;
  for(let i=0;i<ts.length;i++){ const t=ts[i]; if(t.max==null||v<=t.max) return i+1; }
  return null;
}
const plantaById = id => S.plantas.find(p=>p.id===id);
const prodById = id => S.productos.find(p=>p.id===id);
const sortProds = arr => arr.slice().sort((a,b)=> (a.familia||"").localeCompare(b.familia||"","es") || (a.orden??0)-(b.orden??0) || a.nombre.localeCompare(b.nombre,"es"));
const prodsDe = neg => sortProds(S.productos.filter(p=>p.negocio===neg && p.activo!==false));
const plantasDe = (neg, mercado, tipo) => S.plantas.filter(p=>p.activo!==false && (p.negocios||[]).includes(neg) && (!mercado||p.mercado===mercado) && (!tipo||p.tipo===tipo)).sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
function mercadosDe(neg){
  const m={}; plantasDe(neg).forEach(p=>{ if(!p.mercado) return; m[p.mercado]=m[p.mercado]||{own:0,comp:0}; m[p.mercado][p.tipo==="propia"?"own":"comp"]++; });
  return Object.entries(m).sort((a,b)=>(b[1].own>0)-(a[1].own>0)||a[0].localeCompare(b[0],"es"));
}
const allMercados = () => [...new Set(S.plantas.map(p=>p.mercado).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));

/* precio vigente propio por planta/producto */
function precioVigente(plantaId, prodId){
  let best=null;
  for(const r of S.precios){ if(r.plantaId!==plantaId||r.productoId!==prodId) continue;
    if(!best || r.desde>best.desde || (r.desde===best.desde && (r.ts||0)>(best.ts||0))) best=r; }
  return best;
}
function precioEnFecha(plantaId, prodId, fecha){
  let best=null;
  for(const r of S.precios){ if(r.plantaId!==plantaId||r.productoId!==prodId||(fecha&&r.desde>fecha)) continue;
    if(!best || r.desde>best.desde || (r.desde===best.desde && (r.ts||0)>(best.ts||0))) best=r; }
  return best||precioVigente(plantaId, prodId);
}
function precioTramo(rec, t){ if(!rec||!rec.p) return {v:null}; for(let i=t-1;i>=0;i--){ if(rec.p[i]!=null) return {v:rec.p[i], fallback:i!==t-1}; } return {v:null}; }
/* última cotización de competidor */
const empresaDe = p => ((p&&(p.empresa||p.nombre))||"").trim();
function compGroups(neg, mercado){ const m=new Map();
  for(const p of plantasDe(neg,mercado,"competencia")){ const k=empresaDe(p); if(!m.has(k)) m.set(k,{id:k,nombre:k,ids:[],plantas:[]}); const g=m.get(k); g.ids.push(p.id); g.plantas.push(p.nombre); }
  return [...m.values()].sort((a,b)=>(a.nombre==="Otros")-(b.nombre==="Otros")||a.nombre.localeCompare(b.nombre,"es")); }
const plantasTxt = g => g.ids.length>1?`${g.ids.length} plantas`:"";
function ultimaCot(ids, prodId, tramo, ventana){
  let best=null, other=null;
  for(const q of S.cotiz){ if(fueraComp(q)||!ids.includes(q.plantaId)||q.productoId!==prodId) continue;
    if(ventana && daysAgo(q.fecha)>ventana) continue;
    const better=(a,b)=>!b||a.fecha>b.fecha||(a.fecha===b.fecha&&(a.ts||0)>(b.ts||0));
    if(q.tramo===tramo){ if(better(q,best)) best=q; } else if(better(q,other)) other=q; }
  return best?{q:best}:other?{q:other,otro:true}:null;
}
function diffChip(own, comp){
  if(own==null||comp==null||!comp) return "";
  const d=(own-comp)/comp; const cls=Math.abs(d)<0.02?"par":d>0?"above":"below";
  return `<span class="chip ${cls}" title="Duracreto vs. este competidor">${pct(d)}</span>`;
}

/* ---------- render ---------- */
let pendingRender=false;
function render(){
  if(S._lote) return;
  const ae=document.activeElement;
  if(ae && ae.closest && ae.closest("#precios-app,#precios-overlay") && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && S.ready && !render.force){ pendingRender=true; return; }
  render.force=false; pendingRender=false;
  const app=document.getElementById("precios-app");
  if(!app||!S.ready||!S.me){ return; }
  const allowed=VISTAS[S.me.rol]||VISTAS.visualizador; if(!allowed.includes(S.view)) S.view=allowed[0];
  { const nv=negVis().map(n=>n.k), d=nv[0]; ["f","reg","pr","cat"].forEach(k=>{ if(S[k]&&!nv.includes(S[k].neg)) S[k].neg=d; }); if(S.h.neg&&!nv.includes(S.h.neg)) S.h.neg=""; }
  const nav=document.getElementById("precios-nav"); nav.hidden=allowed.length<2;
  nav.querySelectorAll("button").forEach(b=>{ b.hidden=!allowed.includes(b.dataset.view); if(b.dataset.view==="historial") b.textContent=S.me.rol==="asesor"?"Mi historial":"Historial"; b.setAttribute("aria-current", b.dataset.view===S.view?"page":"false"); });
  renderChat();
  const V={comparar:vComparar, registrar:vRegistrar, historial:vHistorial, precios:vPrecios, catalogo:vCatalogo}[S.view]||vComparar;
  app.innerHTML=V();
  renderDrawer();
}
on("focusout",()=>setTimeout(()=>{ if(pendingRender){ const ae=document.activeElement; if(!(ae&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName))) render(); } },0));
const rerender = () => { render.force=true; render(); };

function segNeg(cur, act){ return `<div class="seg" role="group" aria-label="Negocio">${negVis().map(n=>`<button data-act="${act}" data-v="${n.k}" aria-pressed="${cur===n.k}">${n.l}</button>`).join("")}</div>`; }
function readonlyNote(){ return S.canEdit?"":`<div class="hint-box">Solo los editores de la herramienta pueden modificar esta sección. Puedes consultarla.</div>`; }

/* ===== Comparador ===== */
function vComparar(){
  const f=S.f, neg=f.neg, mercs=mercadosDe(neg);
  if(!f.mercado || !mercs.find(m=>m[0]===f.mercado)) f.mercado = mercs[0]?mercs[0][0]:"";
  const owns=plantasDe(neg,f.mercado,"propia"), comps=compGroups(neg,f.mercado);
  if(!owns.find(p=>p.id===f.own)) f.own = owns[0]?owns[0].id:"";
  const prods=prodsDe(neg), ts=tramosDe(neg), u=NEG.find(n=>n.k===neg).u; if(f.tramo>ts.length) f.tramo=1;

  const rows=[]; let nOwn=0,nAbove=0,nBelow=0,sumD=0,nD=0,lastFam=null;
  for(const p of prods){
    if((p.familia||"")!==lastFam){ lastFam=p.familia||""; if(lastFam) rows.push(`<tr class="fam-row"><td class="sticky-c" colspan="1">${esc(lastFam)}</td><td colspan="${comps.length+3}"></td></tr>`); }
    const rec=f.own?precioVigente(f.own,p.id):null, op=precioTramo(rec,f.tramo); const own=op.v; if(own!=null) nOwn++;
    const vals=[]; const cells=comps.map(c=>{
      const r=ultimaCot(c.ids,p.id,f.tramo,f.ventana);
      if(!r) return `<td class="r dim">—</td>`;
      const v=sinISV(r.q); if(!r.otro) vals.push(v);
      return `<td class="r"><div class="cell-price">${money(v)}</div><div>${r.otro?`<span class="tag" title="No hay cotización en esta categoría; se muestra la más reciente de otra">T${r.q.tramo}</span> `:""}${r.otro?"":diffChip(own,v)}</div><span class="sub">${fmtDate(r.q.fecha)}</span></td>`;
    }).join("");
    const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null, mn=vals.length?Math.min(...vals):null;
    let pos="—";
    if(own!=null&&avg!=null){ const d=(own-avg)/avg; sumD+=d; nD++; if(d>0.02)nAbove++; else if(d<-0.02)nBelow++;
      const rank=[...vals,own].sort((a,b)=>a-b).indexOf(own)+1; pos=`${diffChip(own,avg)}<span class="sub">${rank}° de ${vals.length+1} (más barato = 1°)</span>`; }
    rows.push(`<tr class="row-click" data-act="open" data-id="${p.id}">
      <td class="sticky-c prod"><b>${esc(p.nombre)}</b><small>${esc([p.especificacion,p.unidad||u].filter(Boolean).join(" · "))}</small></td>
      <td class="r own-col"><div class="cell-price">${money(own)}</div>${op.fallback?`<span class="tag warn" title="Sin precio para esta categoría; se usa la anterior">categoría inferior</span>`:""}${rec?`<span class="sub">desde ${fmtDate(rec.desde)}</span>`:""}</td>
      ${cells}
      <td class="r"><div class="cell-price">${money(avg)}</div><span class="sub">mín ${money(mn)}</span></td>
      <td class="r">${pos}</td></tr>`);
  }
  const nQ=S.cotiz.filter(q=>{ if(fueraComp(q)) return false; const pl=plantaById(q.plantaId), pr=prodById(q.productoId); return pl&&pr&&pr.negocio===neg&&pl.mercado===f.mercado&&daysAgo(q.fecha)<=30;}).length;

  return `
  <div class="head"><div><h1>Comparador de precios</h1><p>Precio unitario sin ISV de Duracreto frente a la última cotización registrada de cada competidor en el mismo mercado y categoría de volumen.</p></div>
  ${canRegistrar()?`<button class="btn primary" data-act="go" data-v="registrar">+ Registrar cotización</button>`:""}</div>
  <section class="panel"><div class="panel-b filters">
    <div class="fld"><span class="lbl">Negocio</span>${segNeg(neg,"f-neg")}</div>
    <div class="fld"><label for="precios-f-merc">Mercado</label><select id="precios-f-merc" data-bind="f.mercado">${mercs.map(([m,c])=>`<option value="${esc(m)}" ${m===f.mercado?"selected":""}>${esc(m)} · ${c.own} propia${c.own===1?"":"s"}, ${c.comp} comp.</option>`).join("")}</select></div>
    ${owns.length>1?`<div class="fld"><label for="precios-f-own">Planta Duracreto</label><select id="precios-f-own" data-bind="f.own">${owns.map(o=>`<option value="${o.id}" ${o.id===f.own?"selected":""}>${esc(o.nombre)}</option>`).join("")}</select></div>`:""}
    ${ts.length>1?`<div class="fld"><span class="lbl">Categoría de volumen</span><div class="seg" role="group">${ts.map((t,i)=>`<button data-act="f-tramo" data-v="${i+1}" aria-pressed="${f.tramo===i+1}">${esc(t.nombre)}${tramoRango(t)?`<small>${esc(tramoRango(t))} ${u}</small>`:""}</button>`).join("")}</div></div>`:""}
    <div class="fld"><label for="precios-f-vent">Antigüedad máx.</label><select id="precios-f-vent" data-bind="f.ventana" data-num>${[[90,"90 días"],[180,"6 meses"],[365,"12 meses"],[0,"Todo el histórico"]].map(([v,l])=>`<option value="${v}" ${f.ventana===v?"selected":""}>${l}</option>`).join("")}</select></div>
  </div></section>
  ${!f.own?`<div class="hint-box">No hay planta Duracreto registrada en <b>${esc(f.mercado)}</b> para ${esc(NEGL[neg])}. Se muestran solo competidores.</div>`:""}
  <div class="kpis">
    <div class="kpi"><span class="lbl">Productos con precio propio</span><div class="v num">${nOwn}<span class="dim" style="font-size:15px"> / ${prods.length}</span></div><span class="s">${esc(plantaById(f.own)?.nombre||"Sin planta propia")}</span></div>
    <div class="kpi"><span class="lbl">Diferencia promedio vs. mercado</span><div class="v num">${nD?pct(sumD/nD):"—"}</div><span class="s">Positivo: Duracreto más caro</span></div>
    <div class="kpi"><span class="lbl">Arriba / abajo del promedio</span><div class="v num"><span style="color:var(--above)">${nAbove}</span> <span class="dim">/</span> <span style="color:var(--below)">${nBelow}</span></div><span class="s">Productos fuera de ±2%</span></div>
    <div class="kpi"><span class="lbl">Cotizaciones últimos 30 días</span><div class="v num">${nQ}</div><span class="s">${comps.length} competidores en el mercado</span></div>
  </div>
  <section class="panel">
    <div class="panel-h"><h2>${esc(NEGL[neg])} · ${esc(f.mercado||"—")} · ${esc(ts[f.tramo-1].nombre)}</h2><span class="note">Clic en un producto para ver su historial</span></div>
    ${prods.length?`<div class="tbl-wrap"><table class="cmp-t" style="--ncomp:${comps.length}">
      <colgroup><col class="c-prod"><col class="c-own">${comps.map(()=>`<col class="c-comp">`).join("")}<col class="c-avg"><col class="c-pos"></colgroup>
      <thead><tr><th class="sticky-c">Producto</th><th class="r own-col">Duracreto</th>${comps.map(c=>`<th class="r" title="${esc(c.plantas.join(", "))}">${esc(c.nombre)}${plantasTxt(c)?`<span class="sub" style="text-transform:none;letter-spacing:0">${plantasTxt(c)}</span>`:""}</th>`).join("")}<th class="r">Prom. competencia</th><th class="r">Posición</th></tr></thead>
      <tbody>${rows.join("")}</tbody></table></div>`
    : `<div class="empty"><h3>Aún no hay productos de ${esc(NEGL[neg])}</h3>Agrega el catálogo de productos para empezar a comparar. Las columnas de competidores ya están listas: ${comps.map(c=>esc(c.nombre)).join(", ")||"ninguno en este mercado"}.<br><button class="btn primary" data-act="go" data-v="catalogo">Ir al catálogo</button></div>`}
  </section>`;
}

/* ===== Drawer historial producto ===== */
function renderDrawer(){
  const ov=document.getElementById("precios-overlay");
  if(S.edit){ ov.innerHTML=renderEdit(); return; }
  if(S.recentOpen){ ov.innerHTML=renderRecent(); return; }
  if(!S.drawer){ ov.innerHTML=""; return; }
  const p=prodById(S.drawer); if(!p){ S.drawer=null; ov.innerHTML=""; return; }
  const f=S.f, comps=compGroups(p.negocio,f.mercado), compIds=comps.flatMap(c=>c.ids), owns=plantasDe(p.negocio,f.mercado,"propia");
  const quotes=S.cotiz.filter(q=>!fueraComp(q) && q.productoId===p.id && compIds.includes(q.plantaId)).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const ownHist=S.precios.filter(r=>r.productoId===p.id && owns.some(o=>o.id===r.plantaId)).sort((a,b)=>b.desde.localeCompare(a.desde));
  const ts=tramosDe(p.negocio);
  ov.innerHTML=`<div class="scrim" data-act="close"></div>
  <aside class="drawer" role="dialog" aria-label="Historial del producto">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
      <div><span class="lbl">${esc(NEGL[p.negocio])} · ${esc(f.mercado)}</span><h2>${esc(p.nombre)}</h2><span class="sub">${esc([p.familia,p.especificacion,p.unidad].filter(Boolean).join(" · "))}</span></div>
      <button class="btn ghost" data-act="close" aria-label="Cerrar">✕</button></div>
    ${ts.length>1?`<div class="seg" role="group">${ts.map((t,i)=>`<button data-act="f-tramo" data-v="${i+1}" aria-pressed="${f.tramo===i+1}">${esc(t.nombre)}</button>`).join("")}</div>`:""}
    ${chartSVG(p, comps, f.own, f.tramo)}
    <div><span class="lbl">Cotizaciones de la competencia (${quotes.length})</span>
    ${quotes.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Competidor</th><th>Cat.</th><th class="r">Precio s/ISV</th><th>Cliente / proyecto</th></tr></thead><tbody>
      ${quotes.map(q=>`<tr><td>${fmtDate(q.fecha)}</td><td>${esc(compNombre(q,plantaById(q.plantaId)))}</td><td>T${q.tramo}${q.volumen!=null?`<span class="sub">${q.volumen} ${esc(p.unidad||"")}</span>`:""}</td><td class="r cell-price">${money(sinISV(q))}</td><td>${esc([q.cliente,q.proyecto].filter(Boolean).join(" · ")||"—")}</td></tr>`).join("")}
    </tbody></table></div>`:`<p class="note">Sin cotizaciones registradas para este producto en ${esc(f.mercado)}.</p>`}</div>
    <div><span class="lbl">Lista de precios Duracreto</span>
    ${ownHist.length?`<div class="tbl-wrap"><table><thead><tr><th>Vigente desde</th><th>Planta</th>${ts.map(t=>`<th class="r">${esc(t.nombre)}</th>`).join("")}</tr></thead><tbody>
      ${ownHist.map(r=>`<tr><td>${fmtDate(r.desde)}</td><td>${esc(plantaById(r.plantaId)?.nombre)}</td>${ts.map((_,i)=>`<td class="r cell-price">${money(r.p?.[i])}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div>`:`<p class="note">Sin precios propios cargados.</p>`}</div>
  </aside>`;
}
function chartSVG(p, comps, ownId, tramo){
  const series=[];
  comps.forEach((c,i)=>{ const pts=S.cotiz.filter(q=>!fueraComp(q)&&c.ids.includes(q.plantaId)&&q.productoId===p.id&&q.tramo===tramo).map(q=>({t:Date.parse(q.fecha),v:sinISV(q)})).sort((a,b)=>a.t-b.t);
    if(pts.length) series.push({name:c.nombre,color:`var(${PALETTE[i%PALETTE.length]})`,pts}); });
  const own=S.precios.filter(r=>r.plantaId===ownId&&r.productoId===p.id).map(r=>({t:Date.parse(r.desde),v:precioTramo(r,tramo).v})).filter(x=>x.v!=null).sort((a,b)=>a.t-b.t);
  if(!series.length&&!own.length) return `<div class="hint-box">Cuando registres cotizaciones de este producto verás aquí la evolución de precios por competidor junto a la lista de Duracreto.</div>`;
  const now=Date.parse(today());
  const all=[...series.flatMap(s=>s.pts),...own]; let t0=Math.min(...all.map(x=>x.t)), t1=Math.max(now,...all.map(x=>x.t));
  if(t1-t0<30*864e5) t0=t1-30*864e5;
  let v0=Math.min(...all.map(x=>x.v)), v1=Math.max(...all.map(x=>x.v)); const pad=(v1-v0)*0.12||v1*0.05||1; v0=Math.max(0,v0-pad); v1+=pad;
  const W=600,H=240,L=64,R=12,T=12,B=28, X=t=>L+(t-t0)/(t1-t0)*(W-L-R), Y=v=>T+(1-(v-v0)/(v1-v0))*(H-T-B);
  const ticks=4, grid=[]; for(let i=0;i<=ticks;i++){ const v=v0+(v1-v0)*i/ticks; grid.push(`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L-6}" y="${Y(v)+3}" text-anchor="end">${Math.round(v).toLocaleString("es-HN")}</text>`); }
  const xt=[]; for(let i=0;i<=3;i++){ const t=t0+(t1-t0)*i/3, d=new Date(t); xt.push(`<text x="${X(t)}" y="${H-8}" text-anchor="${i===0?"start":i===3?"end":"middle"}">${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCFullYear()).slice(2)}</text>`); }
  let ownPath=""; if(own.length){ let d=`M${X(own[0].t)},${Y(own[0].v)}`; for(let i=1;i<own.length;i++) d+=` H${X(own[i].t)} V${Y(own[i].v)}`; d+=` H${X(t1)}`; ownPath=`<path d="${d}" fill="none" stroke="var(--orange)" stroke-width="3"/>`; }
  const sp=series.map(s=>`<polyline points="${s.pts.map(q=>`${X(q.t)},${Y(q.v)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="1.6"/>${s.pts.map(q=>`<circle cx="${X(q.t)}" cy="${Y(q.v)}" r="3.5" fill="${s.color}"><title>${esc(s.name)}: ${money(q.v)}</title></circle>`).join("")}`).join("");
  return `<div><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolución de precios">${grid.join("")}${xt.join("")}${ownPath}${sp}</svg>
  <div class="legend">${own.length?`<span><i style="background:var(--orange)"></i>Duracreto (${esc(plantaById(ownId)?.nombre||"")})</span>`:""}${series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div></div>`;
}

/* ===== Registrar ===== */
function zonasDe(neg){
  const out=[]; for(const [m] of mercadosDe(neg)){ if(m==="Sin asignar") continue;
    if(m===VS) ZONAS_VS.forEach(z=>out.push({z:z.z, m, planta:z.planta})); else out.push({z:m, m}); }
  return out;
}
const fieldErr = k => S.reg.err[k]?`<span class="err">${esc(S.reg.err[k])}</span>`:"";
const badCls = k => S.reg.err[k]?"bad":"";
function prodOptions(prods, sel){
  const fams=[]; prods.forEach(p=>{ const f=p.familia||"Otros"; let g=fams.find(x=>x.f===f); if(!g){ g={f,items:[]}; fams.push(g); } g.items.push(p); });
  return fams.map(g=>`<optgroup label="${esc(g.f)}">${g.items.map(p=>`<option value="${p.id}" ${p.id===sel?"selected":""}>${esc(p.nombre)}</option>`).join("")}</optgroup>`).join("");
}
/* ===== Condiciones especiales del registro: servicio de construcción, recargo por distancia y control de temperatura ===== */
function condicionesHTML(r){
  const conc=r.neg==="concreto", fileBox=(f,act,id)=>`<div class="file-box ${badCls("servFile")}">${f?`<span class="fname">${esc(f.name)}</span><span class="dim">${(f.size/1048576).toFixed(1)} MB</span><button type="button" class="btn ghost" data-act="${act}">Quitar</button>`
    :`<label class="btn" for="precios-${id}">Adjuntar evidencia</label><input id="precios-${id}" type="file" data-file="dc"><span class="note">Correo, cotización o documento con el precio de Duracreto</span>`}</div>`;
  return `<div class="fld wide"><span class="lbl">Condiciones especiales</span><div class="conds">
    <div class="cond ${r.serv?"on":""}"><label class="check"><input type="checkbox" data-bind="reg.serv" ${r.serv?"checked":""}><span>¿Se factura como <b>servicio de construcción</b>? <span class="dim">(exento de ISV)</span></span></label>
      ${r.serv?`<div class="cond-b">${r.servFile?`<p class="note">Escribe en cada producto el precio de servicio que ofrece Duracreto. Con evidencia, esta cotización no se suma al comparador; se compara solo en el historial.</p>`
            :`<p class="note">Si no tienes un precio de servicio de Duracreto, deja la evidencia vacía: la cotización se compara contra el <b>precio de lista de Duracreto + ISV</b> y sí entra al comparador. Si Duracreto ofreció un precio de servicio, adjunta la evidencia y escríbelo en cada producto.</p>`}
        <div class="fld"><span class="lbl">Evidencia del precio Duracreto <span class="dim">(opcional)</span></span>${fileBox(r.servFile,"servfile-clear","r-servfile")}${fieldErr("servFile")}</div></div>`:""}</div>
    ${conc?`<div class="cond ${r.rec?"on":""}"><label class="check"><input type="checkbox" data-bind="reg.rec" ${r.rec?"checked":""}><span>¿Lleva <b>recargo por distancia</b>?</span></label>
      ${r.rec?`<div class="cond-b">
        <div class="fld"><label for="precios-r-lugar">¿Dónde queda el proyecto? <span class="req">*</span></label>
          <div class="lugar-row"><input id="precios-r-lugar" type="text" autocomplete="off" class="${badCls("lugar")}" data-bind="reg.recQ" value="${esc(r.recQ)}" placeholder="Escribe el municipio o colonia, ej. La Lima"><button type="button" class="btn" data-act="mapa-abrir">Ubicar en el mapa</button></div>
          <div id="precios-lugar-sug">${sugHTML(r)}</div>${fieldErr("lugar")}</div>
        <div id="precios-dist-box">${distHTML(r)}</div>
        <div class="fld"><label for="precios-r-recc">Recargo de la competencia (L por m³) <span class="req">*</span></label><input id="precios-r-recc" type="text" inputmode="decimal" class="num ${badCls("recComp")}" data-bind="reg.recComp" value="${esc(r.recComp)}" placeholder="0.00">${fieldErr("recComp")}<span class="note">Si la competencia no cobra recargo, escribe 0.</span></div>
      </div>`:""}</div>`:""}
    ${conc?`<div class="cond ${r.temp?"on":""}"><label class="check"><input type="checkbox" data-bind="reg.temp" ${r.temp?"checked":""}><span>¿Lleva <b>control de temperatura</b>?</span></label>
      ${r.temp?`<div class="cond-b form-grid">
        <div class="fld"><label for="precios-r-tc">Precio de la competencia (L por m³) <span class="req">*</span></label><input id="precios-r-tc" type="text" inputmode="decimal" class="num ${badCls("tempComp")}" data-bind="reg.tempComp" value="${esc(r.tempComp)}" placeholder="0.00">${fieldErr("tempComp")}</div>
        <div class="fld"><label for="precios-r-tb">Bolsas por m³ que considera Duracreto <span class="req">*</span></label><input id="precios-r-tb" type="text" inputmode="numeric" class="num ${badCls("tempBolsas")}" data-bind="reg.tempBolsas" value="${esc(r.tempBolsas)}" placeholder="0">${fieldErr("tempBolsas")}</div>
        <div class="cat-chip wide">${num(r.tempBolsas)?`${num(r.tempBolsas)} bolsa${num(r.tempBolsas)===1?"":"s"} × ${money(PRECIO_BOLSA())} = <b>${money(num(r.tempBolsas)*PRECIO_BOLSA())} por m³</b> (Duracreto)`:`<span class="dim">Bolsa de hielo Duracreto: ${money(PRECIO_BOLSA())}. Escribe cuántas bolsas por m³.</span>`}</div>
      </div>`:""}</div>`:""}
    ${!conc?`<div class="cond ${r.flete?"on":""}"><label class="check"><input type="checkbox" data-bind="reg.flete" ${r.flete?"checked":""}><span>¿Comparar el precio del <b>flete</b>?</span></label>
      ${r.flete?`<div class="cond-b form-grid">
        <div class="fld"><label for="precios-r-fc">Flete total de la competencia (L) <span class="req">*</span></label><input id="precios-r-fc" type="text" inputmode="decimal" class="num ${badCls("fleteComp")}" data-bind="reg.fleteComp" value="${esc(r.fleteComp)}" placeholder="0.00">${fieldErr("fleteComp")}</div>
        <div class="fld"><label for="precios-r-ftp">Flete total de Transportes Platino (L) <span class="req">*</span></label><input id="precios-r-ftp" type="text" inputmode="decimal" class="num ${badCls("fleteTP")}" data-bind="reg.fleteTP" value="${esc(r.fleteTP)}" placeholder="0.00">${fieldErr("fleteTP")}</div>
        <p class="note wide">Montos totales del flete para esta cotización, sin ISV. Se comparan solo en el historial, no en el comparador.</p>
      </div>`:""}</div>`:""}
  </div></div>`;
}
function sugHTML(r){
  if(r.recBusy) return `<div class="sug-list"><span class="note">Buscando…</span></div>`;
  if(!r.recSug.length) return "";
  return `<div class="sug-list" role="listbox">${r.recSug.map((x,i)=>`<button type="button" class="sug" data-act="lugar-pick" data-i="${i}">📍 ${esc(x.nombre)}</button>`).join("")}</div>`;
}
function distHTML(r){
  if(r.distBusy) return `<div class="dist-box"><span class="note">Calculando la distancia desde nuestras plantas…</span></div>`;
  if(r.distErr) return `<div class="dist-box warn">${esc(r.distErr)}</div>`;
  const d=r.dist; if(!d||!r.lugar) return "";
  return d.dentro
    ? `<div class="dist-box ok">✓ Duracreto puede atender este proyecto desde la planta <b>${esc(d.planta.replace(/^Duracreto - (Planta )?/,""))}</b> sin cobrar recargo <span class="dim">(${d.km} km por carretera${d.aprox?", aprox.":""})</span>.</div>`
    : `<div class="dist-box">Planta Duracreto más cercana: <b>${esc(d.planta.replace(/^Duracreto - (Planta )?/,""))}</b> a <b>${d.km} km</b> por carretera${d.aprox?" (aprox.)":""}.<br>Recargo Duracreto: ${d.km} km × ${money(d.tarifa)} = <b>${money(d.recargo)} por m³</b></div>`;
}
function vRegistrar(){
  const r=S.reg, zonas=zonasDe(r.neg);
  if(!zonas.find(z=>z.z===r.zona)){ const pf=S.regPref||{}; r.zona=(zonas.find(z=>z.planta&&z.planta===pf.planta)||zonas.find(z=>z.m===pf.m)||zonas[0])?.z||""; }
  const zona=zonas.find(z=>z.z===r.zona), mercado=zona?.m||"";
  const comps=compGroups(r.neg,mercado); if(!comps.find(c=>c.id===r.planta)) r.planta=comps[0]?.id||"";
  const prods=prodsDe(r.neg).filter(p=>p.id!==TEMP_ID); if(!r.items.length) r.items=[newItem()]; r.items.forEach(it=>{ if(!prods.find(p=>p.id===it.prod)) it.prod=prods[0]?.id||""; });
  const ts=tramosDe(r.neg), uDef=NEG.find(n=>n.k===r.neg).u;
  const fact=r.isv?1/(1+isv()):1;
  const esOtros=r.planta==="Otros", pideAnexo=!SIN_ANEXO.includes(r.fuente);
  const nRec=S.cotiz.filter(q=>daysAgo(q.fecha)<=7).length;
  return `<div class="reg-wrap">
  <div class="head"><div><h1>Registrar cotización</h1><p>Precio de un competidor. Cada registro alimenta el comparador y queda en el historial.</p>${!S.canWrite?`<div class="hint-box" style="margin-top:8px">Tu acceso a esta página es de solo lectura, así que no podrás guardar. Pide a Diego acceso de Colaborador.</div>`:""}</div>
  <button class="btn" data-act="recent">Últimas registradas${nRec?`<span class="badge">${nRec}</span>`:""}</button></div>
  <section class="panel"><div class="panel-b" style="display:flex;flex-direction:column;gap:18px">
    <div class="fld"><span class="lbl">Negocio</span>${segNeg(r.neg,"r-neg")}</div>
    ${!prods.length?`<div class="hint-box">No hay productos de ${esc(NEGL[r.neg])} en el catálogo.</div>`:""}
    <form id="precios-reg-form" class="form-grid" novalidate>
      <div class="fld"><label for="precios-r-zona">¿De dónde se despacha? <span class="req">*</span></label><select id="precios-r-zona" data-bind="reg.zona">${zonas.map(z=>`<option ${z.z===r.zona?"selected":""}>${esc(z.z)}</option>`).join("")}</select></div>
      <div class="fld"><label for="precios-r-pl">Competidor <span class="req">*</span></label><select id="precios-r-pl" data-bind="reg.planta">${comps.map(c=>`<option value="${esc(c.id)}" ${c.id===r.planta?"selected":""}>${esc(c.nombre)}</option>`).join("")||"<option value=''>Sin competidores en esta zona</option>"}</select></div>
      ${esOtros?`<div class="fld wide"><label for="precios-r-otro">Nombre del competidor <span class="req">*</span></label><input id="precios-r-otro" type="text" class="${badCls("otro")}" data-bind="reg.otro" value="${esc(r.otro)}" placeholder="Ej. Bloquera San José">${fieldErr("otro")}</div>`:""}
      <div class="wide items">${r.items.map((it,k)=>{ const pr=prodById(it.prod), u=pr?.unidad||uDef, vol=num(it.vol), cat=ts.length>1?tramoPorVolumen(r.neg,vol):1, E=f=>`items.${k}.${f}`;
        return `<div class="item-card"><div class="item-h"><span class="lbl">Producto ${r.items.length>1?k+1:""}</span>${r.items.length>1?`<button type="button" class="btn ghost danger" data-act="item-del" data-i="${k}">Quitar</button>`:""}</div>
        <div class="form-grid">
          <div class="fld wide"><label for="precios-r-prod-${k}">Producto <span class="req">*</span></label><select id="precios-r-prod-${k}" data-bind="reg.items.${k}.prod">${prodOptions(prods,it.prod)||"<option value=''>—</option>"}</select></div>
          <div class="fld"><label for="precios-r-precio-${k}">Precio unitario (L por ${esc(u)}) <span class="req">*</span></label><input id="precios-r-precio-${k}" type="text" inputmode="decimal" class="num ${badCls(E("precio"))}" data-bind="reg.items.${k}.precio" value="${esc(it.precio)}" placeholder="0.00">${fieldErr(E("precio"))}</div>
          <div class="fld"><label for="precios-r-vol-${k}">Volumen cotizado (${esc(u)}) <span class="req">*</span></label><input id="precios-r-vol-${k}" type="text" inputmode="decimal" class="num ${badCls(E("vol"))}" data-bind="reg.items.${k}.vol" value="${esc(it.vol)}" placeholder="0">${fieldErr(E("vol"))}</div>
          ${r.serv&&!servLista(r)?`<div class="fld wide"><label for="precios-r-dcs-${k}">Precio de servicio de construcción que ofrece Duracreto (L por ${esc(u)}) <span class="req">*</span></label><input id="precios-r-dcs-${k}" type="text" inputmode="decimal" class="num ${badCls(E("dcServ"))}" data-bind="reg.items.${k}.dcServ" value="${esc(it.dcServ||"")}" placeholder="0.00">${fieldErr(E("dcServ"))}</div>`:""}
          ${ts.length>1?`<div class="fld wide"><span class="lbl">Categoría (automática)</span><div class="cat-chip">${vol!=null&&cat?`<b>${esc(ts[cat-1].nombre)}</b><span class="dim">${esc(tramoRango(ts[cat-1]))} ${esc(u)}</span>`:`<span class="dim">Se asigna al ingresar el volumen</span>`}${num(it.precio)!=null&&r.isv?`<span class="dim" style="margin-left:auto">${money(num(it.precio)*fact)} sin ISV</span>`:""}</div></div>`:""}
        </div></div>`; }).join("")}
        <button type="button" class="btn" data-act="item-add" style="align-self:flex-start">+ Agregar otro producto</button></div>
      ${condicionesHTML(r)}
      ${r.serv?"":`<div class="fld wide"><span class="lbl">ISV</span><label class="check"><input id="precios-r-isv" type="checkbox" data-bind="reg.isv" ${r.isv?"checked":""}> El precio incluye ISV (${S.config.isv??15}%)</label></div>`}
      <div class="fld"><label for="precios-r-fecha">Fecha de la cotización <span class="req">*</span></label><input id="precios-r-fecha" type="date" data-bind="reg.fecha" value="${esc(r.fecha)}"></div>
      <div class="fld"><label for="precios-r-fuente">Fuente <span class="req">*</span></label><select id="precios-r-fuente" data-bind="reg.fuente">${FUENTES.map(x=>`<option ${x===r.fuente?"selected":""}>${x}</option>`).join("")}</select></div>
      ${r.fuente==="Otro"?`<div class="fld wide"><label for="precios-r-fotro">Especifica la fuente <span class="req">*</span></label><input id="precios-r-fotro" type="text" class="${badCls("fuenteOtro")}" data-bind="reg.fuenteOtro" value="${esc(r.fuenteOtro)}">${fieldErr("fuenteOtro")}</div>`:""}
      ${pideAnexo?`<div class="fld wide"><span class="lbl">Anexo de respaldo <span class="req">*</span></span>
        <div class="file-box ${badCls("file")}">${r.file?`<span class="fname">${esc(r.file.name)}</span><span class="dim">${(r.file.size/1048576).toFixed(1)} MB</span><button type="button" class="btn ghost" data-act="file-clear">Quitar</button>`
          :`<label class="btn" for="precios-r-file">Adjuntar archivo</label><input id="precios-r-file" type="file" data-file="1"><span class="note">PDF, foto, Word, Excel u otro archivo, máx. 20 MB</span>`}</div>${fieldErr("file")}</div>`:""}
      <div class="fld"><label for="precios-r-cli">Cliente <span class="req">*</span></label><input id="precios-r-cli" type="text" class="${badCls("cliente")}" data-bind="reg.cliente" value="${esc(r.cliente)}">${fieldErr("cliente")}</div>
      <div class="fld"><label for="precios-r-proy">Proyecto <span class="req">*</span></label><input id="precios-r-proy" type="text" class="${badCls("proyecto")}" data-bind="reg.proyecto" value="${esc(r.proyecto)}">${fieldErr("proyecto")}</div>
      <div class="fld wide"><label for="precios-r-notas">Notas</label><textarea id="precios-r-notas" data-bind="reg.notas" placeholder="Condiciones, bombeo, aditivos, forma de pago…">${esc(r.notas)}</textarea></div>
      <div class="wide" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="note">${r.items.length>1?`${r.items.length} productos en esta cotización. `:""}Los campos con * son obligatorios.</span>
        <button class="btn primary" type="submit" ${(!canRegistrar()||!prods.length||!comps.length||r.saving)?"disabled":""}>${r.saving?"Guardando…":r.items.length>1?`Guardar ${r.items.length} productos`:"Guardar cotización"}</button></div>
    </form></div></section></div>`;
}
/* ===== Ubicación del proyecto: buscador, mapa y distancia ===== */
function pintarLugar(){ const a=document.getElementById("precios-lugar-sug"), b=document.getElementById("precios-dist-box"); if(a) a.innerHTML=sugHTML(S.reg)+(S.reg.recNone?`<div class="sug-list"><span class="note">Sin resultados. Prueba con el municipio (ej. "Choloma") o usa "Ubicar en el mapa".</span></div>`:""); if(b) b.innerHTML=distHTML(S.reg); }
function buscarLugar(){
  const r=S.reg; clearTimeout(buscarLugar._t); r.recNone=false;
  if(r.lugar && r.recQ!==r.lugar.nombre){ r.lugar=null; r.dist=null; r.distErr=""; }
  const q=r.recQ.trim(); if(q.length<3){ r.recSug=[]; r.recBusy=false; return pintarLugar(); }
  buscarLugar._t=setTimeout(async()=>{ const yo=(buscarLugar._n=(buscarLugar._n||0)+1); r.recBusy=true; pintarLugar();
    let res=[]; try{ res=await api("buscarLugar", {texto:q})||[]; }catch(e){ console.error(e); }
    if(yo!==buscarLugar._n) return; r.recBusy=false; r.recSug=res; r.recNone=!res.length; pintarLugar(); }, 450);
}
async function elegirLugar(x){
  const r=S.reg; Object.assign(r,{lugar:{nombre:x.nombre,lat:x.lat,lng:x.lng}, recQ:x.nombre, recSug:[], recNone:false, dist:null, distErr:"", distBusy:true}); delete r.err.lugar; rerender();
  try{ r.dist=await api("distancia", {lat:x.lat, lng:x.lng}); }catch(e){ console.error(e); r.distErr="No se pudo calcular la distancia. Vuelve a seleccionar la ubicación."; }
  r.distBusy=false; rerender();
}
const CDN_LEAFLET="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/", OSM_TILES="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";   // misma versión que el Mapa (comparten window.L)
function cargarLeaflet(){ return new Promise((res,rej)=>{ if(window.L) return res();
  const css=document.createElement("link"); css.rel="stylesheet"; css.href=CDN_LEAFLET+"leaflet.css"; document.head.appendChild(css);
  const sc=document.createElement("script"); sc.src=CDN_LEAFLET+"leaflet.js"; sc.onload=()=>res(); sc.onerror=rej; document.head.appendChild(sc); }); }
function cerrarMapa(){ const m=document.getElementById("precios-mapa-modal"); if(m) m.remove(); abrirMapa._sel=null; }
async function abrirMapa(){
  cerrarMapa(); const m=document.createElement("div"); m.id="precios-mapa-modal"; RAIZ.appendChild(m);
  m.innerHTML=`<div class="scrim" data-act="mapa-cerrar"></div><div class="precios-mapabox" role="dialog" aria-label="Ubicar el proyecto en el mapa">
    <div class="precios-mapah"><div><h2>Ubica el proyecto</h2><span class="note">Toca el mapa donde queda el proyecto. Los círculos muestran los ${RADIO_KM()} km de cobertura de cada planta de concreto.</span></div><button class="btn ghost" data-act="mapa-cerrar" aria-label="Cerrar">✕</button></div>
    <div id="precios-mapa" class="precios-mapacont"><span class="note" style="padding:16px;display:block">Cargando mapa…</span></div>
    <div class="precios-mapaf"><span id="precios-mapa-sel" class="note">Ningún punto seleccionado</span><button class="btn primary" id="precios-mapa-usar" data-act="mapa-usar" disabled>Usar este punto</button></div></div>`;
  try{ await cargarLeaflet(); }catch(e){ const el=document.getElementById("precios-mapa"); if(el) el.innerHTML=`<span class="note" style="padding:16px;display:block">No se pudo cargar el mapa. Usa el buscador.</span>`; return; }
  const box=document.getElementById("precios-mapa"); if(!box) return; box.innerHTML="";
  const r=S.reg, own=plantasDe("concreto",null,"propia").filter(p=>typeof p.lat==="number"&&typeof p.lng==="number");
  const zona=zonasDe("concreto").find(z=>z.z===r.zona), ref=plantaById(zona?.planta)||plantasDe("concreto",zona?.m,"propia")[0];
  const map=L.map(box), ctr=r.lugar?[r.lugar.lat,r.lugar.lng]:(ref&&typeof ref.lat==="number")?[ref.lat,ref.lng]:[15.0,-86.8];
  map.setView(ctr, r.lugar?13:(ref?10:7));
  L.tileLayer(OSM_TILES,{maxZoom:19, attribution:"© OpenStreetMap"}).addTo(map);
  own.forEach(p=>{ L.circle([p.lat,p.lng],{radius:RADIO_KM()*1000,color:"#F49A29",weight:1,fillColor:"#F9D600",fillOpacity:.12}).addTo(map);
    L.circleMarker([p.lat,p.lng],{radius:6,color:"#12130F",weight:2,fillColor:"#F9D600",fillOpacity:1}).bindTooltip(p.nombre.replace(/^Duracreto - /,"")).addTo(map); });
  let mk=null;
  const poner=(lat,lng)=>{ if(mk) mk.setLatLng([lat,lng]); else mk=L.circleMarker([lat,lng],{radius:9,color:"#fff",weight:2,fillColor:"#B42318",fillOpacity:1}).addTo(map);
    abrirMapa._sel={lat,lng}; const t=document.getElementById("precios-mapa-sel"); if(t) t.textContent=`Punto: ${lat.toFixed(5)}, ${lng.toFixed(5)}`; const b=document.getElementById("precios-mapa-usar"); if(b) b.disabled=false; };
  if(r.lugar) poner(r.lugar.lat,r.lugar.lng);
  map.on("click",ev=>poner(ev.latlng.lat,ev.latlng.lng));
  setTimeout(()=>map.invalidateSize(),150);
}
async function usarPuntoMapa(){
  const p=abrirMapa._sel; if(!p) return; const b=document.getElementById("precios-mapa-usar"); if(b){ b.disabled=true; b.textContent="Buscando el lugar…"; }
  let x={nombre:`Punto en el mapa (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`, lat:p.lat, lng:p.lng};
  try{ x=await api("lugarDePunto", {lat:p.lat, lng:p.lng})||x; }catch(e){ console.error(e); }
  cerrarMapa(); elegirLugar(x);
}
/* ===== Editar cotización (solo Diego) ===== */
function renderEdit(){
  const e=S.edit, c=S.cotiz.find(x=>x.id===e.id); if(!c){ S.edit=null; return ""; }
  const p0=prodById(c.productoId), neg=p0?.negocio||prodById(e.productoId)?.negocio||"concreto", pl=plantaById(c.plantaId), mercado=c.mercado||pl?.mercado||"";
  const comps=compGroups(neg,mercado); if(e.planta&&!comps.find(g=>g.id===e.planta)) comps.push({id:e.planta,nombre:e.planta,ids:[c.plantaId]});
  return `<div class="scrim" data-act="edit-close"></div>
  <aside class="drawer" role="dialog" aria-label="Editar cotización">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
      <div><span class="lbl">${esc(NEGL[neg]||"")} · ${esc(c.zona||mercado)}</span><h2>Editar cotización</h2><span class="sub">Registrada por ${esc(nombreDe(c.por))}${c.nItems>1?` · producto ${c.item} de ${c.nItems}`:""}</span></div>
      <button class="btn ghost" data-act="edit-close" aria-label="Cerrar">✕</button></div>
    <form id="precios-edit-form" class="edit-form" novalidate>
      <div class="fld"><label for="precios-e-fecha">Fecha</label><input id="precios-e-fecha" type="date" data-bind="edit.fecha" value="${esc(e.fecha)}"></div>
      <div class="fld"><label for="precios-e-prod">Producto</label><select id="precios-e-prod" data-bind="edit.productoId">${prodOptions(prodsDe(neg), e.productoId)}</select></div>
      <div class="fld"><label for="precios-e-comp">Competidor</label><select id="precios-e-comp" data-bind="edit.planta">${comps.map(g=>`<option value="${esc(g.id)}" ${g.id===e.planta?"selected":""}>${esc(g.nombre)}</option>`).join("")}</select></div>
      ${e.planta==="Otros"?`<div class="fld"><label for="precios-e-otro">Nombre del competidor</label><input id="precios-e-otro" type="text" data-bind="edit.otro" value="${esc(e.otro)}"></div>`:`<div></div>`}
      <div class="fld"><label for="precios-e-vol">Volumen</label><input id="precios-e-vol" type="text" inputmode="decimal" data-bind="edit.vol" value="${esc(e.vol)}"></div>
      <div class="fld"><label for="precios-e-precio">Precio unitario</label><input id="precios-e-precio" type="text" inputmode="decimal" data-bind="edit.precio" value="${esc(e.precio)}"></div>
      ${e.serv?"":`<label class="check wide"><input type="checkbox" data-bind="edit.isv" ${e.isv?"checked":""}> El precio incluye ISV</label>`}
      <div class="fld"><label for="precios-e-cli">Cliente</label><input id="precios-e-cli" type="text" data-bind="edit.cliente" value="${esc(e.cliente)}"></div>
      <div class="fld"><label for="precios-e-proy">Proyecto</label><input id="precios-e-proy" type="text" data-bind="edit.proyecto" value="${esc(e.proyecto)}"></div>
      <div class="fld"><label for="precios-e-fuente">Fuente</label><select id="precios-e-fuente" data-bind="edit.fuente">${FUENTES.map(f=>`<option ${f===e.fuente?"selected":""}>${esc(f)}</option>`).join("")}</select></div>
      ${e.fuente==="Otro"?`<div class="fld"><label for="precios-e-fo">Especifica la fuente</label><input id="precios-e-fo" type="text" data-bind="edit.fuenteOtro" value="${esc(e.fuenteOtro)}"></div>`:`<div></div>`}
      <label class="check wide"><input type="checkbox" data-bind="edit.serv" ${e.serv?"checked":""}><span>Se factura como <b>servicio de construcción</b> (exento de ISV) — aplica a toda la cotización</span></label>
      ${e.serv?`<label class="check wide"><input type="checkbox" data-bind="edit.servLista" ${e.servLista?"checked":""}><span>No hay precio de servicio de Duracreto: comparar contra el precio de lista + ISV</span></label>${e.servLista?"":`<div class="fld wide"><label for="precios-e-dcs">Precio de servicio Duracreto (este producto)</label><input id="precios-e-dcs" type="text" inputmode="decimal" data-bind="edit.dcServ" value="${esc(e.dcServ)}"></div>`}`:""}
      ${e.rec?`<div class="fld"><label for="precios-e-recc">Recargo de la competencia (L por m³)</label><input id="precios-e-recc" type="text" inputmode="decimal" data-bind="edit.recComp" value="${esc(e.recComp)}"></div><div></div>`:""}
      ${e.temp?`<div class="fld"><label for="precios-e-tc">Control de temperatura: competencia (L por m³)</label><input id="precios-e-tc" type="text" inputmode="decimal" data-bind="edit.tempComp" value="${esc(e.tempComp)}"></div>
        <div class="fld"><label for="precios-e-tb">Bolsas por m³ (Duracreto)</label><input id="precios-e-tb" type="text" inputmode="numeric" data-bind="edit.tempBolsas" value="${esc(e.tempBolsas)}"></div>`:""}
      ${e.flete?`<div class="fld"><label for="precios-e-fc">Flete total competencia (L)</label><input id="precios-e-fc" type="text" inputmode="decimal" data-bind="edit.fleteComp" value="${esc(e.fleteComp)}"></div>
        <div class="fld"><label for="precios-e-ftp">Flete total Transportes Platino (L)</label><input id="precios-e-ftp" type="text" inputmode="decimal" data-bind="edit.fleteTP" value="${esc(e.fleteTP)}"></div>`:""}
      ${e.rec||e.temp||e.flete?`<p class="note wide">El recargo, el control de temperatura y el flete aplican a toda la cotización: se actualizan en todos sus productos.</p>`:""}
      <div class="fld wide"><label for="precios-e-notas">Notas</label><input id="precios-e-notas" type="text" data-bind="edit.notas" value="${esc(e.notas)}"></div>
      ${e.err?`<span class="err wide">${esc(e.err)}</span>`:""}
      <div class="wide" style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" type="button" data-act="edit-close">Cancelar</button><button class="btn primary" type="submit" ${e.saving?"disabled":""}>${e.saving?"Guardando…":"Guardar cambios"}</button></div>
    </form>
  </aside>`;
}
async function saveEdit(){
  const e=S.edit; if(!e||e.saving||!gestionaCot()) return;
  const c=S.cotiz.find(x=>x.id===e.id); if(!c) return;
  const precio=num(e.precio), vol=num(e.vol), p=prodById(e.productoId);
  if(precio==null||precio<=0){ e.err="Ingresa un precio válido."; return rerender(); }
  if(vol==null||vol<=0){ e.err="Ingresa el volumen cotizado."; return rerender(); }
  if(!e.cliente.trim()||!e.proyecto.trim()){ e.err="Cliente y proyecto son obligatorios."; return rerender(); }
  if(e.planta==="Otros"&&!e.otro.trim()){ e.err="Escribe el nombre del competidor."; return rerender(); }
  const pl=plantaById(c.plantaId), mercado=c.mercado||pl?.mercado||"", neg=p?.negocio||"concreto";
  const g=compGroups(neg,mercado).find(x=>x.id===e.planta);
  const ts=tramosDe(neg);
  const cambios={fecha:e.fecha, productoId:e.productoId, precio, precioSinISV:Math.round((e.isv?precio/(1+isv()):precio)*100)/100, incluyeISV:!!e.isv,
    volumen:vol, tramo:ts.length>1?(tramoPorVolumen(neg,vol)||1):1, cliente:e.cliente.trim(), proyecto:e.proyecto.trim(), fuente:e.fuente,
    fuenteOtro:e.fuente==="Otro"?e.fuenteOtro.trim():"", notas:e.notas.trim(), competidorOtro:e.planta==="Otros"?e.otro.trim():"",
    editadoPor:S.me.usuario, editadoTs:Date.now()};
  if(g){ cambios.plantaId=g.ids[0]; cambios.empresa=g.nombre; }
  if(e.serv){ if(e.servLista){ cambios.precioDCServicio=""; } else { const v=num(e.dcServ); if(v==null||v<=0){ e.err="Ingresa el precio de servicio de Duracreto."; return rerender(); } cambios.precioDCServicio=v; } cambios.incluyeISV=false; cambios.precioSinISV=precio; }
  // Servicio de construcción y "vs. lista + ISV" aplican a toda la cotización
  const servCambia=!!e.serv!==!!c.servicioConstruccion||(!!e.serv&&!!e.servLista!==!!c.servLista);
  cambios.servicioConstruccion=!!e.serv; cambios.servLista=!!e.serv&&!!e.servLista;
  const grupo={};
  if(e.rec){ const v=num(e.recComp); if(v==null||v<0){ e.err="Escribe el recargo de la competencia (0 si no cobra)."; return rerender(); } grupo.recargoComp=v; }
  if(e.temp){ const v=num(e.tempComp), b=num(e.tempBolsas); if(v==null||v<0||b==null||b<=0){ e.err="Revisa el control de temperatura."; return rerender(); }
    grupo.tempComp=v; grupo.tempBolsas=b; grupo.tempDC=Math.round(b*(num(c.precioBolsa)||PRECIO_BOLSA())*100)/100; }
  if(e.flete){ const v=num(e.fleteComp), w=num(e.fleteTP); if(v==null||v<0||w==null||w<0){ e.err="Revisa los montos del flete."; return rerender(); } grupo.fleteComp=v; grupo.fleteTP=w; }
  e.saving=true; e.err=""; rerender();
  try{ await S.db.doc("cotizaciones/"+e.id).update({...cambios, ...grupo});
    if(c.grupo&&(Object.keys(grupo).length||servCambia)){ for(const o of S.cotiz.filter(x=>x.grupo===c.grupo&&x.id!==c.id)){
        const extra=servCambia?(e.serv?{servicioConstruccion:true, servLista:!!e.servLista, incluyeISV:false, precioSinISV:num(o.precio), ...(e.servLista?{precioDCServicio:""}:{})}
          :{servicioConstruccion:false, servLista:false, precioDCServicio:""}):{};
        await S.db.doc("cotizaciones/"+o.id).update({...grupo, ...extra, editadoPor:S.me.usuario, editadoTs:Date.now()}); } }
    S.edit=null; toast("Cotización actualizada"); rerender(); }
  catch(err){ e.saving=false; rerender(); fail(err); }
}
function renderRecent(){
  const list=S.cotiz.slice().sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,25);
  return `<div class="scrim" data-act="recent-close"></div><aside class="drawer" role="dialog" aria-label="Últimas cotizaciones">
    <div style="display:flex;justify-content:space-between;align-items:center"><h2>Últimas registradas</h2><button class="btn ghost" data-act="recent-close" aria-label="Cerrar">✕</button></div>
    ${list.length?`<div class="feed">${list.map(q=>{ const p=prodById(q.productoId), pl=plantaById(q.plantaId);
      return `<div class="feed-item"><div><b>${esc(p?.nombre||"Producto eliminado")}</b><span class="sub">${esc(compNombre(q,pl))} · ${esc(q.zona||pl?.mercado||"")}</span><span class="sub">${esc(nombreDe(q.por))}${q.cliente?` · ${esc(q.cliente)}`:""}</span></div>
      <div class="r" style="text-align:right"><span class="cell-price">${money(sinISV(q))}</span><span class="sub">${fmtDate(q.fecha)}</span></div></div>`; }).join("")}</div>
      <button class="btn" data-act="go" data-v="historial">Ver historial completo</button>`
    :`<div class="empty"><h3>Sin cotizaciones todavía</h3>La primera que guardes aparecerá aquí.</div>`}
  </aside>`;
}

/* ===== Historial ===== */
function filtHist(){
  const h=S.h, q=h.q.trim().toLowerCase();
  return S.cotiz.filter(c=>{ const p=prodById(c.productoId), pl=plantaById(c.plantaId);
    if(h.neg&&p?.negocio!==h.neg) return false; if(h.mercado&&pl?.mercado!==h.mercado) return false;
    if(h.planta&&empresaDe(pl)!==h.planta) return false; if(h.prod&&c.productoId!==h.prod) return false;
    if(q && ![p?.nombre,pl?.nombre,c.competidorOtro,c.zona,c.cliente,c.proyecto,c.notas].join(" ").toLowerCase().includes(q)) return false; return true;
  }).sort((a,b)=>(b.ts||0)-(a.ts||0)||b.fecha.localeCompare(a.fecha)); // más reciente ingresada primero
}
/* Una cotización = todas las filas con el mismo "grupo" (o una sola fila) */
function agruparCot(list){ const out=[], idx=new Map();
  for(const c of list){ const k=c.grupo||c.id; if(!idx.has(k)){ idx.set(k,out.length); out.push({k,items:[]}); } out[idx.get(k)].items.push(c); }
  // Si el filtro deja solo parte de una cotización, se muestra completa para que el total sea correcto
  out.forEach(g=>{ if(list.find(c=>c.grupo&&c.grupo===g.k)) g.items=S.cotiz.filter(c=>c.grupo===g.k); g.items.sort((a,b)=>(a.item||0)-(b.item||0)); }); return out; }
/* Precio Duracreto comparable para una fila: servicio de construcción → precio indicado; si no, lista vigente a la fecha en la planta de despacho */
function dcDe(c){
  if(fueraComp(c)) return {v:num(c.precioDCServicio), serv:true};
  const p=prodById(c.productoId), pl=plantaById(c.plantaId); if(!p) return {v:null};
  const ref=plantaById(c.plantaRef); const own=(ref&&ref.tipo==="propia"&&(ref.negocios||[]).includes(p.negocio))?ref:plantasDe(p.negocio,c.mercado||pl?.mercado,"propia")[0];
  return {v: own?precioTramo(precioEnFecha(own.id,p.id,c.fecha),c.tramo).v:null, planta:own};
}
const esConcretoM3 = p => p && p.negocio==="concreto" && (p.familia||"")!=="Servicios";
function cotCardHTML(g){
  const c0=g.items[0], pl0=plantaById(c0.plantaId), dueno=gestionaCot();
  const filas=[]; let tc=0, td=0, incompleto=false;
  const fila=(nombre, sub, catVol, vc, vd, cant, acts, extra)=>{ const sc=vc!=null&&cant!=null?vc*cant:null, sd=vd!=null&&cant!=null?vd*cant:null;
    if(sc!=null&&sd!=null){ tc+=sc; td+=sd; } else incompleto=true;
    filas.push(`<tr class="${extra||""}"><td><b>${nombre}</b>${sub?`<span class="sub">${sub}</span>`:""}</td><td>${catVol}</td>
      <td class="r"><span class="cell-price">${money(vc)}</span></td><td class="r"><span class="cell-price">${money(vd)}</span>${vd!=null&&vc!=null?`<div>${diffChip(vd,vc)}</div>`:""}</td>
      <td class="r num">${money(sc)}</td><td class="r num">${money(sd)}</td><td class="acts">${acts||""}</td></tr>`); };
  let volConc=0;
  for(const c of g.items){ const p=prodById(c.productoId), sl=!!(c.servicioConstruccion&&c.servLista), v=sl?num(c.precio):sinISV(c), dc0=dcDe(c), dc=sl&&dc0.v!=null?{...dc0, v:Math.round(dc0.v*(1+isv())*100)/100}:dc0; if(esConcretoM3(p)) volConc+=Number(c.volumen)||0;
    const acts=S.confirmDel===c.id?`<span class="confirm">¿Eliminar? <button class="btn danger" data-act="del-q" data-id="${c.id}">Sí</button><button class="btn ghost" data-act="del-cancel">No</button></span>`
      :dueno?`<span class="row-acts"><button class="icon-btn" data-act="edit-q" data-id="${c.id}" title="Editar" aria-label="Editar producto">✎</button><button class="icon-btn" data-act="del-ask" data-id="${c.id}" title="Eliminar" aria-label="Eliminar producto">✕</button></span>`:"";
    fila(esc(p?.nombre||"Producto eliminado"), [c.incluyeISV?`${money(c.precio)} c/ISV`:"", dc.serv?"Duracreto: precio de servicio":"", sl?`Competencia exento · Duracreto: lista + ISV (${money(dc0.v)} sin ISV)`:""].filter(Boolean).join(" · "),
      `T${c.tramo}${c.volumen!=null?`<span class="sub num">${c.volumen} ${esc(p?.unidad||"")}</span>`:""}`, v, dc.v, Number(c.volumen)||null, acts);
  }
  if(c0.recargo){ const lugar=c0.lugar?.nombre||"", pc=String(c0.plantaCercana||"").replace(/^Duracreto - (Planta )?/,"");
    fila("Recargo por distancia", `${esc(lugar)}${pc?` · ${esc(pc)} a ${c0.distanciaKm} km${Number(c0.recargoDC)?"":" — Duracreto sin recargo"}`:""}`, `<span class="sub num">${volConc} m³</span>`,
      num(c0.recargoComp), num(c0.recargoDC)??0, volConc||null, "", "extra"); }
  if(c0.temperatura){ fila("Control de temperatura", `Duracreto: ${c0.tempBolsas} bolsa${Number(c0.tempBolsas)===1?"":"s"} × ${money(c0.precioBolsa)} por m³`, `<span class="sub num">${num(c0.tempVol)||volConc} m³</span>`,
      num(c0.tempComp), num(c0.tempDC), num(c0.tempVol)||volConc||null, "", "extra"); }
  if(c0.flete){ fila("Flete (total)", "Duracreto: Transportes Platino", `<span class="sub">Global</span>`, num(c0.fleteComp), num(c0.fleteTP), 1, "", "extra"); }
  const d=tc?(td-tc)/tc:null;
  const badges=[c0.servicioConstruccion?(c0.servLista?`<span class="tag">Servicio de construcción · vs. lista + ISV</span>`:`<span class="tag warn">Servicio de construcción · fuera del comparador</span>`):"", c0.recargo?`<span class="tag">Recargo por distancia</span>`:"", c0.temperatura?`<span class="tag">Control de temperatura</span>`:"", c0.flete?`<span class="tag">Flete</span>`:""].filter(Boolean).join(" ");
  const anexoL=a=>a?.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">Ver anexo</a>`:a?.nombre?`<span title="${esc(a.nota||"")}">${esc(a.nombre)}</span>`:"";
  const editado=g.items.find(x=>x.editadoTs);
  return `<article class="cot-card">
    <header class="cot-h">${c0.ts?`<details class="info-i"><summary aria-label="Fecha de ingreso" title="Fecha de ingreso">i</summary><span>Cotización ingresada el ${esc(new Date(Number(c0.ts)).toLocaleDateString("es-HN",{day:"numeric",month:"long",year:"numeric"}))} a las ${esc(new Date(Number(c0.ts)).toLocaleTimeString("es-HN",{hour:"numeric",minute:"2-digit"}))}</span></details>`:""}
      <div class="cot-main"><span class="sub">Fecha de cotización: <b>${fmtDate(c0.fecha)}</b> · ${esc(c0.zona||pl0?.mercado||"")}</span><h3>${esc(compNombre(c0,pl0)||"—")}</h3>
        <span>${esc([c0.cliente,c0.proyecto].filter(Boolean).join(" · ")||"—")}</span>${badges?`<div class="cot-badges">${badges}</div>`:""}</div>
      <div class="cot-meta"><span>${esc(c0.fuente==="Otro"&&c0.fuenteOtro?c0.fuenteOtro:(c0.fuente||""))}${c0.anexo?` · ${anexoL(c0.anexo)}`:c0.anexoPendiente?" · Anexo pendiente":""}</span>
        ${c0.anexoDC?`<span>Evidencia Duracreto: ${anexoL(c0.anexoDC)}</span>`:""}
        <span class="sub">Registró ${esc(nombreDe(c0.por))}${editado?` · editada ${fmtDate(new Date(editado.editadoTs).toISOString().slice(0,10))}`:""}</span></div>
    </header>
    <div class="tbl-wrap"><table class="cot-t"><thead><tr><th>Producto</th><th>Cat. / vol.</th><th class="r">Competencia</th><th class="r">Duracreto</th><th class="r">Subtotal competencia</th><th class="r">Subtotal Duracreto</th><th></th></tr></thead>
    <tbody>${filas.join("")}</tbody>
    <tfoot><tr><td colspan="4"><b>Total de la cotización</b>${incompleto?`<span class="sub">Hay líneas sin precio de Duracreto o sin volumen; no se suman al total.</span>`:""}</td>
      <td class="r"><span class="cell-price">${money(tc||null)}</span></td><td class="r"><span class="cell-price">${money(td||null)}</span>${d!=null?`<div>${diffChip(td,tc)}</div>`:""}</td><td></td></tr></tfoot></table></div>
    ${c0.notas?`<p class="cot-notas">${esc(c0.notas)}</p>`:""}
  </article>`;
}
function vHistorial(){
  const h=S.h, list=filtHist(), grupos=agruparCot(list);
  const comps=[...new Set(S.plantas.filter(p=>p.tipo==="competencia"&&(!h.mercado||p.mercado===h.mercado)&&(!h.neg||(p.negocios||[]).includes(h.neg))).map(empresaDe))].sort((a,b)=>a.localeCompare(b,"es"));
  const prods=h.neg?prodsDe(h.neg):sortProds(S.productos);
  return `<div class="head"><div><h1>${S.me.rol==="asesor"?"Mi historial de cotizaciones":"Historial de cotizaciones"}</h1><p>${S.me.rol==="asesor"?"Las cotizaciones de la competencia que usted registró.":S.me.rol==="area"?"Cotizaciones de la competencia de su negocio.":"Todas las cotizaciones de la competencia registradas por el equipo."} Precios mostrados sin ISV.</p></div>
  ${S.dl?`<button class="btn" data-act="csv" ${list.length?"":"disabled"}>Descargar CSV</button>`:""}</div>
  <section class="panel"><div class="panel-b filters">
    <div class="fld"><label for="precios-h-neg">Negocio</label><select id="precios-h-neg" data-bind="h.neg"><option value="">Todos</option>${negVis().map(n=>`<option value="${n.k}" ${h.neg===n.k?"selected":""}>${n.l}</option>`).join("")}</select></div>
    <div class="fld"><label for="precios-h-merc">Mercado</label><select id="precios-h-merc" data-bind="h.mercado"><option value="">Todos</option>${allMercados().map(m=>`<option ${h.mercado===m?"selected":""}>${esc(m)}</option>`).join("")}</select></div>
    <div class="fld"><label for="precios-h-pl">Competidor</label><select id="precios-h-pl" data-bind="h.planta"><option value="">Todos</option>${comps.map(c=>`<option value="${esc(c)}" ${h.planta===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    <div class="fld"><label for="precios-h-prod">Producto</label><select id="precios-h-prod" data-bind="h.prod"><option value="">Todos</option>${prods.map(p=>`<option value="${p.id}" ${h.prod===p.id?"selected":""}>${esc(p.nombre)}</option>`).join("")}</select></div>
    <div class="fld" style="flex:1;min-width:180px"><label for="precios-h-q">Buscar</label><input id="precios-h-q" type="text" data-bind="h.q" value="${esc(h.q)}" placeholder="Cliente, proyecto, nota…"></div>
  </div></section>
  <section class="panel"><div class="panel-h"><h2>${grupos.length} cotizaci${grupos.length===1?"ón":"ones"}</h2><span class="note">${list.length} producto${list.length===1?"":"s"} · precios sin ISV</span></div>
  ${grupos.length?`<div class="cot-list">${grupos.map(cotCardHTML).join("")}</div>`:`<div class="empty"><h3>No hay cotizaciones con estos filtros</h3>Registra la primera desde el módulo Registrar cotización.<br><button class="btn primary" data-act="go" data-v="registrar">Registrar cotización</button></div>`}
  </section>`;
}

/* ===== Precios Duracreto ===== */
function vPrecios(){
  const s=S.pr, owns=plantasDe(s.neg,null,"propia"); if(!owns.find(o=>o.id===s.planta)) s.planta=owns[0]?.id||"";
  const prods=prodsDe(s.neg), ts=tramosDe(s.neg); const dis=S.canEdit?"":"disabled";
  const nChanged=Object.keys(s.draft).length; let fam=null;
  const rows=prods.map(p=>{ const rec=precioVigente(s.planta,p.id), d=s.draft[p.id];
    let famRow=""; if((p.familia||"")!==fam){ fam=p.familia||""; if(fam) famRow=`<tr class="fam-row"><td colspan="${ts.length+2}">${esc(fam)}</td></tr>`; }
    return famRow+`<tr><td class="prod"><b>${esc(p.nombre)}</b><small>${esc([p.especificacion,p.unidad].filter(Boolean).join(" · "))}</small></td>
    ${ts.map((_,i)=>{ const cur=rec?.p?.[i]; const val=d?d[i]:(cur??""); const ch=d&&String(d[i]??"")!==String(cur??"");
      return `<td class="r"><input class="price-in ${ch?"changed":""}" type="text" inputmode="decimal" id="precios-pp-${p.id}-${i}" data-price="${p.id}" data-i="${i}" value="${esc(val)}" placeholder="—" ${dis} aria-label="${esc(p.nombre)} ${esc(ts[i].nombre)}"></td>`; }).join("")}
    <td>${rec?fmtDate(rec.desde):"<span class='dim'>Sin precio</span>"}</td></tr>`; }).join("");
  return `<div class="head"><div><h1>Lista de precios Duracreto</h1><p>Precio unitario sin ISV por planta y categoría de volumen (máximo cuatro). Cada vez que guardas se crea una nueva versión con su fecha de vigencia; el historial se conserva.</p></div></div>
  ${readonlyNote()}
  <section class="panel"><div class="panel-b filters">
    <div class="fld"><span class="lbl">Negocio</span>${segNeg(s.neg,"p-neg")}</div>
    <div class="fld"><label for="precios-p-pl">Planta</label><select id="precios-p-pl" data-bind="pr.planta">${owns.map(o=>`<option value="${o.id}" ${o.id===s.planta?"selected":""}>${esc(o.nombre)} · ${esc(o.mercado)}</option>`).join("")||"<option value=''>Sin plantas propias</option>"}</select></div>
    <div class="fld"><label for="precios-p-desde">Vigente desde</label><input id="precios-p-desde" type="date" data-bind="pr.desde" value="${esc(s.desde)}" ${dis}></div>
    <div class="fld" style="flex:1;min-width:200px"><label for="precios-p-nota">Nota de la versión</label><input id="precios-p-nota" type="text" data-bind="pr.nota" value="${esc(s.nota)}" placeholder="Ej. Ajuste por costo de cemento" ${dis}></div>
    <div class="fld"><button class="btn primary" data-act="save-prices" ${nChanged&&S.canEdit?"":"disabled"}>Guardar ${nChanged||""} cambio${nChanged===1?"":"s"}</button></div>
  </div></section>
  <section class="panel">
  ${prods.length?`<div class="tbl-wrap"><table><thead><tr><th>Producto</th>${ts.map(t=>`<th class="r">${esc(t.nombre)}${tramoRango(t)?`<span class="sub" style="text-transform:none">${esc(tramoRango(t))}</span>`:""}</th>`).join("")}<th>Vigente desde</th></tr></thead><tbody>${rows}</tbody></table></div>`
  :`<div class="empty"><h3>Sin productos de ${esc(NEGL[s.neg])}</h3>Agrega productos en el catálogo y aquí aparecerá la cuadrícula de precios por categoría.<br><button class="btn primary" data-act="go" data-v="catalogo">Ir al catálogo</button></div>`}
  </section>
  <p class="note">Si un producto tiene un solo precio (servicios, La Ceiba), llena solo la primera categoría: el comparador usa ese precio en las categorías superiores y lo marca como "categoría inferior".</p>`;
}

/* ===== Catálogo ===== */
function vCatalogo(){
  const c=S.cat;
  const tabs=[["productos","Productos"],["plantas","Plantas y competidores"],["tramos","Categorías de volumen"]];
  const body={productos:catProductos, plantas:catPlantas, tramos:catTramos}[c.tab]();
  return `<div class="head"><div><h1>Catálogo</h1><p>Productos, plantas y reglas que estructuran el estudio de precios.</p></div></div>
  <div class="subtabs seg" role="group">${tabs.map(([k,l])=>`<button data-act="cat-tab" data-v="${k}" aria-pressed="${c.tab===k}">${l}</button>`).join("")}</div>${body}`;
}
function catProductos(){
  const c=S.cat, list=sortProds(S.productos.filter(p=>p.negocio===c.neg)), u=NEG.find(n=>n.k===c.neg).u, dis=S.canEdit?"":"disabled";
  const fams=[...new Set(S.productos.filter(p=>p.negocio===c.neg).map(p=>p.familia).filter(Boolean))];
  let fam=null;
  return `${readonlyNote()}
  <div class="fld"><span class="lbl">Negocio</span>${segNeg(c.neg,"c-neg")}</div>
  <div class="two">
  <section class="panel"><div class="panel-h"><h2>${list.length} producto${list.length===1?"":"s"} de ${esc(NEGL[c.neg])}</h2><span class="note">Ordenados por familia y posición</span></div>
  ${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Orden</th><th>Producto</th><th>Especificación</th><th>Unidad</th><th>Código</th><th></th></tr></thead><tbody>
  ${list.map((p)=>{ let fr=""; if((p.familia||"")!==fam){ fam=p.familia||""; fr=`<tr class="fam-row"><td colspan="6">${esc(fam||"Sin familia")}</td></tr>`; }
    const sib=list.filter(x=>(x.familia||"")===(p.familia||"")), k=sib.indexOf(p);
    if(c.edit===p.id){ const e=c.editData;
      return fr+`<tr><td></td><td colspan="4"><div class="form-grid">
        <div class="fld"><label for="precios-e-fam">Familia</label><input id="precios-e-fam" type="text" list="precios-fam-list" data-bind="cat.editData.familia" value="${esc(e.familia)}"></div>
        <div class="fld"><label for="precios-e-nom">Nombre</label><input id="precios-e-nom" type="text" data-bind="cat.editData.nombre" value="${esc(e.nombre)}"></div>
        <div class="fld"><label for="precios-e-esp">Especificación</label><input id="precios-e-esp" type="text" data-bind="cat.editData.especificacion" value="${esc(e.especificacion)}"></div>
        <div class="fld"><label for="precios-e-uni">Unidad</label><input id="precios-e-uni" type="text" data-bind="cat.editData.unidad" value="${esc(e.unidad)}"></div>
        <div class="fld"><label for="precios-e-cod">Código</label><input id="precios-e-cod" type="text" data-bind="cat.editData.codigo" value="${esc(e.codigo)}"></div>
        <label class="check"><input id="precios-e-act" type="checkbox" data-bind="cat.editData.activo" ${e.activo!==false?"checked":""}> Activo</label>
      </div></td><td><div style="display:flex;gap:6px;flex-direction:column"><button class="btn primary" data-act="prod-save" data-id="${p.id}">Guardar</button><button class="btn ghost" data-act="prod-cancel">Cancelar</button></div></td></tr>`; }
    return fr+`<tr ${p.activo===false?'class="dim"':""}><td><div style="display:flex;gap:4px"><button class="icon-btn" data-act="prod-move" data-id="${p.id}" data-d="-1" ${k===0||dis?"disabled":""} title="Subir">▲</button><button class="icon-btn" data-act="prod-move" data-id="${p.id}" data-d="1" ${k===sib.length-1||dis?"disabled":""} title="Bajar">▼</button></div></td>
      <td class="prod"><b>${esc(p.nombre)}</b>${p.activo===false?` <span class="tag">inactivo</span>`:""}</td><td>${esc(p.especificacion||"")}</td><td>${esc(p.unidad||u)}</td><td class="num">${esc(p.codigo||"")}</td>
      <td><button class="btn ghost" data-act="prod-edit" data-id="${p.id}" ${dis}>Editar</button></td></tr>`; }).join("")}
  </tbody></table></div>`:`<div class="empty"><h3>Catálogo vacío</h3>Agrega el primer producto con el formulario o pega una lista desde Excel.</div>`}
  </section>
  <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
  <section class="panel"><div class="panel-h"><h2>Agregar producto</h2></div><div class="panel-b">
    <form id="precios-np-form" class="form-grid" novalidate>
      <div class="fld"><label for="precios-np-fam">Familia</label><input id="precios-np-fam" type="text" list="precios-fam-list" data-bind="cat.np.familia" value="${esc(c.np.familia)}" placeholder="${c.neg==="concreto"?"Ej. Estructural":c.neg==="bloques"?"Ej. Bloque 6\"":"Ej. Grava"}" ${dis}></div>
      <div class="fld"><label for="precios-np-nom">Nombre</label><input id="precios-np-nom" type="text" data-bind="cat.np.nombre" value="${esc(c.np.nombre)}" placeholder="${c.neg==="concreto"?"Ej. Concreto 3,000 PSI":"Nombre del producto"}" ${dis}></div>
      <div class="fld"><label for="precios-np-esp">Especificación</label><input id="precios-np-esp" type="text" data-bind="cat.np.esp" value="${esc(c.np.esp)}" placeholder="${c.neg==="concreto"?"Ej. TMA 3/4\", rev. 4\"":"Opcional"}" ${dis}></div>
      <div class="fld"><label for="precios-np-uni">Unidad</label><input id="precios-np-uni" type="text" data-bind="cat.np.unidad" value="${esc(c.np.unidad)}" placeholder="${esc(u)}" ${dis}></div>
      <div class="fld"><label for="precios-np-cod">Código</label><input id="precios-np-cod" type="text" data-bind="cat.np.codigo" value="${esc(c.np.codigo)}" placeholder="Opcional (SAP)" ${dis}></div>
      <div class="fld" style="justify-content:flex-end"><button class="btn primary" type="submit" ${dis}>Agregar</button></div>
    </form>
    <datalist id="precios-fam-list">${fams.map(f=>`<option value="${esc(f)}">`).join("")}</datalist>
  </div></section>
  <section class="panel"><div class="panel-h"><h2>Pegar lista desde Excel</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
    <span class="note">Una fila por producto, columnas separadas por tabulación: <b>Familia · Nombre · Especificación · Unidad · Código</b>. Se agregan a ${esc(NEGL[c.neg])} en el orden pegado.</span>
    <textarea id="precios-paste" data-bind="cat.paste" placeholder="Estructural&#9;Concreto 3,000 PSI&#9;TMA 3/4&quot;&#9;m³&#9;CP-3000" ${dis}>${esc(c.paste)}</textarea>
    <div><button class="btn" data-act="paste" ${dis}>Importar ${c.paste.trim()?c.paste.trim().split(/\n/).length+" filas":""}</button></div>
  </div></section></div></div>`;
}
function catPlantas(){
  const c=S.cat, list=S.plantas.slice().sort((a,b)=>(a.mercado||"").localeCompare(b.mercado||"","es")||(a.tipo==="propia"?-1:1)-(b.tipo==="propia"?-1:1)||a.nombre.localeCompare(b.nombre,"es"));
  const mercs=allMercados();
  return `<div class="two">
  <section class="panel"><div class="panel-h"><h2>${list.length} plantas</h2><span class="note">Las plantas con la misma empresa se muestran en una sola columna</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>Planta</th><th>Tipo</th><th>Empresa (columna en el comparador)</th><th>Ciudad</th><th>Mercado</th><th>Negocios</th><th></th></tr></thead><tbody>
  ${list.map(p=>`<tr ${p.activo===false?'class="dim"':""}><td><b>${esc(p.nombre)}</b></td>
    <td>${p.tipo==="propia"?`<span class="tag own">Duracreto</span>`:`<span class="tag">Competencia</span>`}</td>
    <td>${p.tipo==="propia"?"Duracreto":`<input type="text" id="precios-pe-${p.id}" data-plemp="${p.id}" value="${esc(empresaDe(p))}" style="min-width:150px" ${S.canWrite?"":"disabled"} aria-label="Empresa de ${esc(p.nombre)}">`}</td><td>${esc(p.ciudad||"")}</td>
    <td><select id="precios-pm-${p.id}" data-plmerc="${p.id}" ${S.canWrite?"":"disabled"} aria-label="Mercado de ${esc(p.nombre)}">${mercs.map(m=>`<option ${m===p.mercado?"selected":""}>${esc(m)}</option>`).join("")}</select></td>
    <td style="white-space:normal">${NEG.map(n=>`<label class="check" style="min-height:0;display:inline-flex;margin-right:8px;font-size:12px"><input type="checkbox" data-plneg="${p.id}" data-v="${n.k}" ${(p.negocios||[]).includes(n.k)?"checked":""} ${S.canWrite?"":"disabled"}> ${n.l.split(" ")[0]}</label>`).join("")}</td>
    <td><button class="btn ghost" data-act="pl-toggle" data-id="${p.id}" ${S.canWrite?"":"disabled"}>${p.activo===false?"Activar":"Desactivar"}</button></td></tr>`).join("")}
  </tbody></table></div></section>
  <section class="panel"><div class="panel-h"><h2>Agregar competidor</h2></div><div class="panel-b">
    <form id="precios-npl-form" class="form-grid" novalidate>
      <div class="fld wide"><label for="precios-npl-nom">Nombre de la planta</label><input id="precios-npl-nom" type="text" data-bind="cat.npl.nombre" value="${esc(c.npl.nombre)}" placeholder="Ej. Concremix - Planta Comayagua"></div>
      <div class="fld"><label for="precios-npl-ciu">Ciudad</label><input id="precios-npl-ciu" type="text" data-bind="cat.npl.ciudad" value="${esc(c.npl.ciudad)}"></div>
      <div class="fld"><label for="precios-npl-mer">Mercado</label><input id="precios-npl-mer" type="text" list="precios-merc-list" data-bind="cat.npl.mercado" value="${esc(c.npl.mercado)}" placeholder="Elige o escribe uno nuevo"><datalist id="precios-merc-list">${mercs.map(m=>`<option value="${esc(m)}">`).join("")}</datalist></div>
      <div class="fld wide"><span class="lbl">Negocios que ofrece</span><div>${NEG.map(n=>`<label class="check" style="display:inline-flex;margin-right:12px"><input type="checkbox" data-nplneg="${n.k}" ${c.npl.negocios.includes(n.k)?"checked":""}> ${n.l}</label>`).join("")}</div></div>
      <div class="wide"><button class="btn primary" type="submit" ${S.canWrite?"":"disabled"}>Agregar competidor</button></div>
    </form>
    <p class="note" style="margin-top:12px">Las plantas propias se administran por los editores. Fuente inicial: base de coordenadas del mapa de estudio de mercado.</p>
  </div></section></div>`;
}
function catTramos(){
  const dis=S.canEdit?"":"disabled";
  return `${readonlyNote()}<section class="panel"><div class="panel-h"><h2>Categorías de volumen por negocio</h2><span class="note">Hasta cuatro por negocio. Con rangos definidos, la categoría de una cotización se asigna sola según el volumen.</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>Negocio</th><th>Categorías</th>${[1,2,3,4].map(i=>`<th>Categoría ${i}</th>`).join("")}</tr></thead><tbody>
  ${NEG.map(n=>{ const ts=tramosDe(n.k), nT=ts.length; return `<tr><td><b>${n.l}</b><span class="sub">Volumen en ${n.u}</span></td>
    <td><select id="precios-trn-${n.k}" data-trn="${n.k}" ${dis} aria-label="Número de categorías">${[1,2,3,4].map(k=>`<option ${k===nT?"selected":""}>${k}</option>`).join("")}</select></td>
    ${[0,1,2,3].map(i=>{ const t=ts[i]||{nombre:DEF_TRAMOS[i],min:null,max:null}; return `<td data-trcol="${n.k}-${i}" ${i>=nT?'style="opacity:.3"':""}><div style="display:flex;flex-direction:column;gap:6px;min-width:180px">
    <input type="text" id="precios-tr-${n.k}-${i}-n" data-tr="${n.k}" data-i="${i}" data-f="nombre" value="${esc(t.nombre)}" ${dis} aria-label="Nombre categoría ${i+1}">
    <div style="display:flex;gap:6px;align-items:center"><input type="text" inputmode="decimal" class="num" style="width:76px" id="precios-tr-${n.k}-${i}-a" data-tr="${n.k}" data-i="${i}" data-f="min" value="${t.min??""}" placeholder="desde" ${dis} aria-label="Desde"><span class="dim">a</span><input type="text" inputmode="decimal" class="num" style="width:76px" id="precios-tr-${n.k}-${i}-b" data-tr="${n.k}" data-i="${i}" data-f="max" value="${t.max??""}" placeholder="hasta" ${dis} aria-label="Hasta"></div></div></td>`; }).join("")}</tr>`; }).join("")}
  </tbody></table></div>
  <div class="panel-b" style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;border-top:1px solid var(--line)">
    <div class="fld"><label for="precios-cfg-isv">ISV (%)</label><input id="precios-cfg-isv" type="text" inputmode="decimal" class="num" style="width:90px" data-cfgisv value="${S.config.isv??15}" ${dis}></div>
    <button class="btn primary" data-act="save-tramos" ${dis}>Guardar configuración</button>
    <span class="note">Rangos inclusivos (ej. 1 a 10, 11 a 500). Deja "hasta" vacío en la última categoría. Con una sola categoría el negocio usa precio de lista único.</span></div></section>`;
}

/* ---------- eventos ---------- */
function setPath(path, val){ const ks=path.split("."); let o=S; for(let i=0;i<ks.length-1;i++) o=o[ks[i]]; o[ks.at(-1)]=val; }
function go(v){ S.view=v; S.drawer=null; S.confirmDel=null; try{localStorage.setItem("mv_precios_vista",v);}catch(e){} rerender(); if(MODEL) MODEL.scrollTop=0; }

on("click", async e=>{
  const t=e.target.closest("[data-act]"); if(!t) return; const a=t.dataset.act, v=t.dataset.v, id=t.dataset.id;
  if(a==="go"){ S.recentOpen=false; return go(v); }
  if(a==="recent"){ S.recentOpen=true; return rerender(); }
  if(a==="recent-close"){ S.recentOpen=false; return rerender(); }
  if(a==="file-clear"){ S.reg.file=null; return rerender(); }
  if(a==="servfile-clear"){ S.reg.servFile=null; return rerender(); }
  if(a==="lugar-pick"){ const x=S.reg.recSug[Number(t.dataset.i)]; if(x) elegirLugar(x); return; }
  if(a==="mapa-abrir"){ abrirMapa(); return; }
  if(a==="mapa-cerrar"){ cerrarMapa(); return; }
  if(a==="mapa-usar"){ usarPuntoMapa(); return; }
  if(a==="item-add"){ const last=S.reg.items[S.reg.items.length-1]; S.reg.items.push({prod:last?.prod||"",precio:"",vol:""}); rerender(); document.getElementById("precios-r-prod-"+(S.reg.items.length-1))?.focus(); return; }
  if(a==="item-del"){ S.reg.items.splice(Number(t.dataset.i),1); S.reg.err={}; return rerender(); }
  if(a==="chat-toggle"){ S.chat.open=!S.chat.open; if(S.chat.open) markSeen(); return renderChat(true); }
  if(a==="chat-close"){ S.chat.open=false; return renderChat(true); }
  if(a==="chat-thread") return openThread(id);
  if(a==="chat-back"){ closeThread(); return renderChat(true); }
  if(a==="f-neg"){ S.f.neg=v; return rerender(); }
  if(a==="f-tramo"){ S.f.tramo=Number(v); return rerender(); }
  if(a==="r-neg"){ if(S.reg.neg!==v){ S.reg.neg=v; S.reg.items=[newItem()]; S.reg.err={}; } return rerender(); }
  if(a==="p-neg"){ S.pr.neg=v; S.pr.draft={}; return rerender(); }
  if(a==="c-neg"){ S.cat.neg=v; S.cat.edit=null; return rerender(); }
  if(a==="cat-tab"){ S.cat.tab=v; return rerender(); }
  if(a==="open"){ S.drawer=id; return rerender(); }
  if(a==="close"){ S.drawer=null; return rerender(); }
  if(a==="del-ask"){ S.confirmDel=id; return rerender(); }
  if(a==="edit-q"){ if(!gestionaCot()) return; const c=S.cotiz.find(x=>x.id===id); if(!c) return;
    S.edit={id, fecha:c.fecha||"", productoId:c.productoId||"", planta:c.empresa||empresaDe(plantaById(c.plantaId))||"", otro:c.competidorOtro||"", vol:c.volumen??"", precio:c.precio??"", isv:!!c.incluyeISV,
      cliente:c.cliente||"", proyecto:c.proyecto||"", fuente:c.fuente||"Cotización", fuenteOtro:c.fuenteOtro||"", notas:c.notas||"", saving:false, err:"",
      serv:!!c.servicioConstruccion, servLista:!!c.servLista||(!!c.servicioConstruccion&&!num(c.precioDCServicio)), dcServ:c.precioDCServicio??"", rec:!!c.recargo, recComp:c.recargoComp??"", temp:!!c.temperatura, tempComp:c.tempComp??"", tempBolsas:c.tempBolsas??"", flete:!!c.flete, fleteComp:c.fleteComp??"", fleteTP:c.fleteTP??""}; return rerender(); }
  if(a==="edit-close"){ S.edit=null; return rerender(); }
  if(a==="del-cancel"){ S.confirmDel=null; return rerender(); }
  if(a==="del-q"){ if(!gestionaCot()) return; S.confirmDel=null; try{ await S.db.doc("cotizaciones/"+id).delete(); toast("Cotización eliminada"); }catch(err){ fail(err); } return; }
  if(a==="save-prices") return savePrices();
  if(a==="prod-edit"){ const p=prodById(id); S.cat.edit=id; S.cat.editData={familia:p.familia||"",nombre:p.nombre,especificacion:p.especificacion||"",unidad:p.unidad||"",codigo:p.codigo||"",activo:p.activo!==false}; return rerender(); }
  if(a==="prod-cancel"){ S.cat.edit=null; return rerender(); }
  if(a==="prod-save"){ const d=S.cat.editData; if(!d.nombre.trim()) return toast("El nombre es obligatorio");
    try{ await S.db.doc("maestro/v1/productos/"+id).update({familia:d.familia.trim(),nombre:d.nombre.trim(),especificacion:d.especificacion.trim(),unidad:d.unidad.trim(),codigo:d.codigo.trim(),activo:!!d.activo}); S.cat.edit=null; toast("Producto actualizado"); rerender(); }catch(err){ fail(err); } return; }
  if(a==="prod-move") return moveProd(id, Number(t.dataset.d));
  if(a==="paste") return importPaste();
  if(a==="pl-toggle"){ const p=plantaById(id); try{ await S.db.doc("plantas/"+id).update({activo:p.activo===false}); }catch(err){ fail(err); } return; }
  if(a==="save-tramos") return saveTramos();
  if(a==="csv") return exportCSV();
});
on("keydown",e=>{ if(e.key==="Escape"&&document.getElementById("precios-mapa-modal")){ cerrarMapa(); return; } if(e.key==="Escape"){ if(S.chat.open){ S.chat.open=false; renderChat(true); } else if(S.drawer||S.recentOpen){ S.drawer=null; S.recentOpen=false; rerender(); } }
  if(e.key==="Enter"&&!e.shiftKey&&e.target.id==="precios-chat-input"){ e.preventDefault(); chatSend(); } });

/* Las fotos pueden pasar de 20 MB al elegirlas: se reducen antes de subirlas (reducirImagen). */
const esFoto = f => /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(f.type||"");
function onField(e){
  const el=e.target;
  if(el.dataset.bind){ let val=el.type==="checkbox"?el.checked:el.value; if(el.dataset.num!==undefined) val=Number(val); setPath(el.dataset.bind,val);
    if(el.dataset.bind==="reg.zona") S.reg.planta="";
    if(el.dataset.bind==="edit.serv"&&val&&S.edit&&!num(S.edit.dcServ)) S.edit.servLista=true;
    if(el.dataset.bind.startsWith("reg.")){ const k=el.dataset.bind.slice(4); if(S.reg.err[k]){ delete S.reg.err[k]; el.classList.remove("bad"); } }
    if(el.tagName==="SELECT" || el.type==="checkbox"){ if(e.type==="change") rerender(); }
    else if(e.type==="change") return;
    else if(el.dataset.bind==="reg.recQ") buscarLugar();
    else if(el.dataset.bind==="h.q"||el.dataset.bind==="reg.tempBolsas"||/^reg\.items\.\d+\.(precio|vol)$/.test(el.dataset.bind)) softUpdate(el);
    return; }
  if(el.dataset.file==="dc" && e.type==="change"){ const f=el.files&&el.files[0]; if(!f) return;
    if(f.size>20*1048576&&!esFoto(f)){ S.reg.err.servFile="El archivo pasa de 20 MB."; return rerender(); }
    S.reg.servFile=f; delete S.reg.err.servFile; return rerender(); }
  if(el.dataset.file && e.type==="change"){ const f=el.files&&el.files[0]; if(!f) return;
    if(f.size>20*1048576&&!esFoto(f)){ S.reg.err.file="El archivo pasa de 20 MB."; return rerender(); }
    S.reg.file=f; delete S.reg.err.file; return rerender(); }
  if(el.dataset.price){ const pid=el.dataset.price, i=Number(el.dataset.i); const rec=precioVigente(S.pr.planta,pid);
    const nT=tramosDe(S.pr.neg).length, idx=[...Array(nT).keys()]; const d=S.pr.draft[pid]||idx.map(k=>rec?.p?.[k]??""); d[i]=el.value; const same=idx.every(k=>String(num(d[k])??"")===String(rec?.p?.[k]??""));
    if(same) delete S.pr.draft[pid]; else S.pr.draft[pid]=d; el.classList.toggle("changed",!same);
    const b=document.querySelector('[data-act="save-prices"]'); const n=Object.keys(S.pr.draft).length; if(b){ b.disabled=!n||!S.canEdit; b.textContent=`Guardar ${n||""} cambio${n===1?"":"s"}`; } return; }
  if(el.dataset.nplneg && e.type==="change"){ const k=el.dataset.nplneg, arr=S.cat.npl.negocios; if(el.checked&&!arr.includes(k)) arr.push(k); if(!el.checked) S.cat.npl.negocios=arr.filter(x=>x!==k); return; }
  if(el.dataset.trn && e.type==="change"){ const k=el.dataset.trn, nT=Number(el.value); for(let i=0;i<4;i++){ const c=document.querySelector(`[data-trcol="${k}-${i}"]`); if(c) c.style.opacity=i<nT?"1":".3"; } return; }
  if(el.dataset.plemp && e.type==="change"){ const v=el.value.trim(); if(!v) return; S.db.doc("plantas/"+el.dataset.plemp).update({empresa:v}).then(()=>toast("Empresa actualizada")).catch(fail); return; }
  if(el.dataset.plmerc && e.type==="change"){ S.db.doc("plantas/"+el.dataset.plmerc).update({mercado:el.value}).then(()=>toast("Mercado actualizado")).catch(fail); return; }
  if(el.dataset.plneg && e.type==="change"){ const p=plantaById(el.dataset.plneg); let arr=(p.negocios||[]).slice(); if(el.checked) arr.push(el.dataset.v); else arr=arr.filter(x=>x!==el.dataset.v);
    S.db.doc("plantas/"+p.id).update({negocios:[...new Set(arr)]}).catch(fail); return; }
}
on("input",onField); on("change",onField);
// actualizaciones ligeras sin perder el foco
function softUpdate(el){ clearTimeout(softUpdate._t); softUpdate._t=setTimeout(()=>{ const id=el.id, pos=el.selectionStart; rerender(); const n=document.getElementById(id); if(n){ n.focus(); try{n.setSelectionRange(pos,pos);}catch(e){} } },350); }

on("submit", async e=>{
  e.preventDefault(); const f=e.target;
  if(f.id==="precios-reg-form") return saveCot();
  if(f.id==="precios-edit-form") return saveEdit();
  if(f.id==="precios-chat-form") return chatSend();
  if(f.id==="precios-np-form") return addProd();
  if(f.id==="precios-npl-form") return addPlanta();
});

function fail(err){ console.error(err); const c=err&&err.code;
  if(c==="sin_autorizacion"||(c==="invalid_argument"&&soloConsulta())) return toast(SIN_AUT);
  toast(c==="invalid_argument"?"No tienes permiso para guardar este cambio, o el dato no es válido.":err&&err.codigo==="red"?err.message:"No se pudo guardar. Revisa tu conexión e intenta de nuevo.", "error"); }

async function saveCot(){
  const r=S.reg; if(r.saving) return;
  if(soloConsulta()){ toast(SIN_AUT); return; }
  const zona=zonasDe(r.neg).find(z=>z.z===r.zona), mercado=zona?.m||"";
  const g=compGroups(r.neg,mercado).find(x=>x.id===r.planta);
  const ts=tramosDe(r.neg); const err={};
  r.items.forEach((it,k)=>{ const p=num(it.precio), v=num(it.vol);
    if(p==null||p<=0) err[`items.${k}.precio`]="Ingresa un precio válido.";
    if(v==null||v<=0) err[`items.${k}.vol`]="Ingresa el volumen cotizado."; });
  if(!r.cliente.trim()) err.cliente="Escribe el nombre del cliente.";
  if(!r.proyecto.trim()) err.proyecto="Escribe el nombre del proyecto.";
  if(r.planta==="Otros"&&!r.otro.trim()) err.otro="Escribe el nombre del competidor.";
  if(r.fuente==="Otro"&&!r.fuenteOtro.trim()) err.fuenteOtro="Indica de dónde viene el precio.";
  const pideAnexo=!SIN_ANEXO.includes(r.fuente);
  if(pideAnexo&&!r.file&&S.assets) err.file="Adjunta la cotización, factura o documento de respaldo.";
  const conc=r.neg==="concreto", conRec=conc&&r.rec, conTemp=conc&&r.temp;
  const sLista=servLista(r);
  if(r.serv&&!sLista){ r.items.forEach((it,k)=>{ const v=num(it.dcServ); if(v==null||v<=0) err[`items.${k}.dcServ`]="Ingresa el precio de servicio de Duracreto."; });
    if(!r.servFile&&S.assets) err.servFile="Adjunta la evidencia del precio de Duracreto."; }
  if(conRec){ if(!r.lugar||!r.dist) err.lugar=r.distBusy?"Espera a que termine el cálculo de la distancia.":"Busca y selecciona la ubicación del proyecto.";
    const v=num(r.recComp); if(v==null||v<0) err.recComp="Escribe el recargo de la competencia (0 si no cobra)."; }
  const conFlete=!conc&&r.flete;
  if(conFlete){ const v=num(r.fleteComp), w=num(r.fleteTP); if(v==null||v<0) err.fleteComp="Escribe el flete total de la competencia."; if(w==null||w<0) err.fleteTP="Escribe el flete total de Transportes Platino."; }
  if(conTemp){ const v=num(r.tempComp); if(v==null||v<0) err.tempComp="Escribe el precio por m³ de la competencia.";
    const b=num(r.tempBolsas); if(b==null||b<=0) err.tempBolsas="Escribe cuántas bolsas por m³."; }
  r.err=err; if(!g||r.items.some(it=>!it.prod)){ toast("Selecciona competidor y producto"); return rerender(); }
  if(Object.keys(err).length){ toast("Revisa los campos marcados"); return rerender(); }
  r.saving=true; rerender();
  let anexo=null, anexoDC=null;
  try{
    if(pideAnexo&&r.file&&S.assets){ const up=await S.assets.upload(r.file,{mercado, fecha:r.fecha, competidor:r.planta==="Otros"?`Otros-${r.otro.trim()}`:g.nombre, cliente:r.cliente.trim(), proyecto:r.proyecto.trim()});
      anexo={id:up.id, url:up.url, nombre:up.nombre||r.file.name, tipo:up.contentType, bytes:up.sizeBytes}; }
    if(r.serv&&r.servFile&&S.assets){ const up=await S.assets.upload(r.servFile,{mercado, fecha:r.fecha, competidor:"Duracreto servicio de construccion", cliente:r.cliente.trim(), proyecto:r.proyecto.trim()});
      anexoDC={id:up.id, url:up.url, nombre:up.nombre||r.servFile.name, tipo:up.contentType, bytes:up.sizeBytes}; }
  }catch(e){ console.error(e); r.saving=false; toast(e&&e.code==="muy_grande"?"El archivo pasa de 20 MB. Redúcelo e intenta de nuevo.":"No se pudo subir un archivo. Intenta de nuevo.", "error"); return rerender(); }
  const now=Date.now(), grupo=r.items.length>1?`g${now.toString(36)}${Math.random().toString(36).slice(2,6)}`:"";
  const conISV=!r.serv&&!!r.isv, d=r.dist||{}, bolsas=num(r.tempBolsas)||0;
  const comun={plantaId:g.ids[0], empresa:g.nombre, competidorOtro:r.planta==="Otros"?r.otro.trim():"", incluyeISV:conISV,
    servicioConstruccion:!!r.serv, servLista:sLista, anexoDC,
    recargo:conRec, lugar:conRec?r.lugar:null, plantaCercanaId:conRec?d.plantaId:"", plantaCercana:conRec?d.planta:"", distanciaKm:conRec?d.km:"",
    recargoDC:conRec?d.recargo:"", recargoComp:conRec?num(r.recComp):"", recargoAprox:conRec?!!d.aprox:false,
    temperatura:conTemp, tempComp:conTemp?num(r.tempComp):"", tempBolsas:conTemp?bolsas:"", precioBolsa:conTemp?PRECIO_BOLSA():"", tempDC:conTemp?Math.round(bolsas*PRECIO_BOLSA()*100)/100:"",
    flete:conFlete, fleteComp:conFlete?num(r.fleteComp):"", fleteTP:conFlete?num(r.fleteTP):"", fecha:r.fecha, zona:r.zona, mercado, plantaRef:zona?.planta||"",
    cliente:r.cliente.trim(), proyecto:r.proyecto.trim(), fuente:r.fuente, fuenteOtro:r.fuente==="Otro"?r.fuenteOtro.trim():"", anexo, anexoPendiente:pideAnexo&&!anexo,
    notas:r.notas.trim(), por:S.me.usuario, grupo, nItems:r.items.length};
  let ok=0;
  try{
    for(let k=0;k<r.items.length;k++){ const it=r.items[k], precio=num(it.precio), vol=num(it.vol);
      await S.db.collection("cotizaciones").add({...comun, productoId:it.prod, precio, precioSinISV:Math.round((conISV?precio/(1+isv()):precio)*100)/100, precioDCServicio:r.serv&&!sLista?num(it.dcServ):"",
        volumen:vol, tramo:ts.length>1?(tramoPorVolumen(r.neg,vol)||1):1, item:k+1, ts:now+k}); ok++; }
    Object.assign(S.reg,{items:[newItem()],cliente:"",proyecto:"",notas:"",otro:"",fuenteOtro:"",file:null,err:{},saving:false,
      serv:false, servFile:null, rec:false, recQ:"", recSug:[], recBusy:false, lugar:null, dist:null, distBusy:false, distErr:"", recComp:"", temp:false, tempComp:"", tempBolsas:"", flete:false, fleteComp:"", fleteTP:""});
    toast(ok>1?`${ok} productos guardados`:"Cotización guardada"); rerender();
  }catch(err2){ r.saving=false; r.items=r.items.slice(ok); rerender(); fail(err2); if(ok) toast(`Se guardaron ${ok} productos; revisa los restantes e intenta de nuevo.`); }
}
async function addProd(){
  const c=S.cat, n=c.np; if(!n.nombre.trim()) return toast("Escribe el nombre del producto");
  const fam=n.familia.trim(); const sib=S.productos.filter(p=>p.negocio===c.neg&&(p.familia||"")===fam);
  const orden=sib.length?Math.max(...sib.map(p=>p.orden??0))+10:10;
  try{ await S.db.collection("maestro/v1/productos").add({negocio:c.neg,familia:fam,nombre:n.nombre.trim(),especificacion:n.esp.trim(),unidad:n.unidad.trim()||NEG.find(x=>x.k===c.neg).u,codigo:n.codigo.trim(),orden,activo:true,ts:Date.now()});
    c.np={familia:fam,nombre:"",esp:"",unidad:n.unidad,codigo:""}; toast("Producto agregado"); rerender(); }catch(err){ fail(err); }
}
async function importPaste(){
  const c=S.cat, lines=c.paste.split(/\r?\n/).map(l=>l.split("\t").map(x=>x.trim())).filter(r=>r.some(Boolean));
  if(!lines.length) return toast("Pega al menos una fila");
  const base={}; let ok=0;
  for(const r of lines){ const [familia="",nombre="",esp="",unidad="",codigo=""]= r.length===1?["",r[0]]:r; if(!nombre) continue;
    if(base[familia]==null){ const sib=S.productos.filter(p=>p.negocio===c.neg&&(p.familia||"")===familia); base[familia]=sib.length?Math.max(...sib.map(p=>p.orden??0)):0; }
    base[familia]+=10;
    try{ await S.db.collection("maestro/v1/productos").add({negocio:c.neg,familia,nombre,especificacion:esp,unidad:unidad||NEG.find(x=>x.k===c.neg).u,codigo,orden:base[familia],activo:true,ts:Date.now()}); ok++; }catch(err){ fail(err); break; } }
  c.paste=""; toast(`${ok} producto${ok===1?"":"s"} importado${ok===1?"":"s"}`); rerender();
}
async function moveProd(id, d){
  const p=prodById(id); const sib=sortProds(S.productos.filter(x=>x.negocio===p.negocio&&(x.familia||"")===(p.familia||""))); const i=sib.indexOf(p), j=i+d; if(j<0||j>=sib.length) return;
  // reasignar orden secuencial para evitar empates
  const arr=sib.slice(); [arr[i],arr[j]]=[arr[j],arr[i]];
  try{ for(let k=0;k<arr.length;k++){ const o=(k+1)*10; if(arr[k].orden!==o) await S.db.doc("maestro/v1/productos/"+arr[k].id).update({orden:o}); } }catch(err){ fail(err); }
}
async function addPlanta(){
  const n=S.cat.npl; if(!n.nombre.trim()||!n.mercado.trim()) return toast("Nombre y mercado son obligatorios"); if(!n.negocios.length) return toast("Marca al menos un negocio");
  const id="precios-comp-"+n.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)+"-"+Date.now().toString(36);
  try{ await S.db.doc("plantas/"+id).set({nombre:n.nombre.trim(),empresa:n.nombre.split(" - ")[0].trim(),tipo:"competencia",ciudad:n.ciudad.trim(),mercado:n.mercado.trim(),negocios:n.negocios,activo:true});
    S.cat.npl={nombre:"",ciudad:"",mercado:"",negocios:["concreto"]}; toast("Competidor agregado"); rerender(); }catch(err){ fail(err); }
}
async function savePrices(){
  const s=S.pr; if(!s.planta) return; const ids=Object.keys(s.draft); if(!ids.length) return;
  if(!s.desde) return toast("Indica la fecha de vigencia");
  let n=0;
  for(const pid of ids){ const p=s.draft[pid].map(num);
    try{ await S.db.collection("maestro/v1/precios").add({plantaId:s.planta,productoId:pid,p,desde:s.desde,nota:s.nota.trim(),por:S.me?.usuario||null,ts:Date.now()}); n++; }catch(err){ fail(err); break; } }
  s.draft={}; s.nota=""; toast(`${n} precio${n===1?"":"s"} actualizado${n===1?"":"s"}`); rerender();
}
async function saveTramos(){
  const tramos={};
  for(const n of NEG){ const nT=Number(document.querySelector(`[data-trn="${n.k}"]`)?.value||1); tramos[n.k]=[...Array(nT).keys()].map(i=>{ const g=f=>document.querySelector(`[data-tr="${n.k}"][data-i="${i}"][data-f="${f}"]`)?.value??"";
    return {nombre:g("nombre").trim()||DEF_TRAMOS[i], min:num(g("min")), max:num(g("max"))}; }); }
  const iv=num(document.querySelector("[data-cfgisv]")?.value);
  try{ await S.db.doc("maestro/v1").set({...S.config, tramos, isv:iv??15}); toast("Configuración guardada"); }catch(err){ fail(err); }
}
async function exportCSV(){
  const list=filtHist(); const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const head=["Fecha","Negocio","Producto","Competidor","Mercado","Se despacha desde","Categoría","Volumen","Precio ingresado","Incluye ISV","Precio sin ISV","Precio Duracreto","Servicio de construcción","Ubicación del proyecto","Planta más cercana","Km","Recargo competencia (L/m³)","Recargo Duracreto (L/m³)","Temperatura competencia (L/m³)","Bolsas Duracreto/m³","Temperatura Duracreto (L/m³)","Flete competencia (L, total)","Flete Transportes Platino (L, total)","Cliente","Proyecto","Fuente","Anexo","Notas","Registró","Cotización"];
  const rows=list.map(c=>{ const p=prodById(c.productoId), pl=plantaById(c.plantaId), dc=dcDe(c); return [c.fecha,NEGL[p?.negocio]||"",p?.nombre,compNombre(c,pl),pl?.mercado,c.zona||"","T"+c.tramo,c.volumen,c.precio,c.incluyeISV?"Sí":"No",sinISV(c).toFixed(2),dc.v!=null?Number(dc.v).toFixed(2):"",
    c.servicioConstruccion?"Sí":"No",c.lugar?.nombre||"",c.plantaCercana||"",c.distanciaKm??"",c.recargo?c.recargoComp:"",c.recargo?c.recargoDC:"",c.temperatura?c.tempComp:"",c.temperatura?c.tempBolsas:"",c.temperatura?c.tempDC:"",c.flete?c.fleteComp:"",c.flete?c.fleteTP:"",
    c.cliente,c.proyecto,c.fuente==="Otro"?c.fuenteOtro:c.fuente,c.anexo?.nombre||"",c.notas,nombreDe(c.por),c.grupo||c.id].map(q).join(","); });
  try{ await S.dl.save({filename:`cotizaciones_competencia_${today()}.csv`, data:"﻿"+[head.map(q).join(","),...rows].join("\n")}); }catch(err){ if(err?.code!=="declined") toast("No se pudo descargar el archivo"); }
}
/* ---------- usuarios y sesión (el inicio de sesión lo hace el cascarón; aquí solo se arma S.me) ---------- */
const nombreDe = u => (S.usuarios.find(x=>x.id===u)?.nombre)||"";
const compNombre = (q,pl) => { const e=q.empresa||empresaDe(pl); return e==="Otros"&&q.competidorOtro?`Otros · ${q.competidorOtro}`:e; };
const canRegistrar = () => !!S.me && (S.me.rol==="editor"||S.me.rol==="asesor");
const puedeBorrar = c => gestionaCot();
function startSession(rec){
  S.me={usuario:rec.id, nombre:rec.nombre, rol:rec.rol||"visualizador", cargo:rec.cargo||"", coanfitrion:rec.coanfitrion===true}; S.usuarios=S.usuarios.length?S.usuarios:[{id:rec.id,nombre:rec.nombre,rol:rec.rol,activo:true}];
  S.canEdit=S.me.rol==="editor"; S.drawer=null; S.recentOpen=false;
  // Selección inicial del comparador por persona (columna "inicio" de la pestaña Usuarios: negocio|mercado|planta)
  const [ni,mi,oi]=String(rec.inicio||INICIO_DEF).split("|"); if(NEGL[ni]){ S.f.neg=ni; S.reg.neg=ni; } S.f.mercado=mi||""; S.f.own=oi||""; S.reg.zona=""; S.regPref={m:mi||"", planta:oi||""};
  subscribeChat(); rerender();
}

/* ---------- chat de soporte ---------- */
const isOwnerChat = () => S.me?.usuario===CHAT_OWNER;
const hora = ts => { const d=new Date(ts); const hoy=new Date(); const hh=d.toLocaleTimeString("es-HN",{hour:"numeric",minute:"2-digit"}); return d.toDateString()===hoy.toDateString()?hh:`${d.toLocaleDateString("es-HN",{day:"2-digit",month:"short"})} ${hh}`; };
const seenKey = () => "dc-chat-visto-"+(S.me?.usuario||"");
function getSeen(){ try{ return Number(localStorage.getItem(seenKey())||0); }catch(e){ return 0; } }
function markSeen(){ if(isOwnerChat()) return; try{ localStorage.setItem(seenKey(), String(Date.now())); }catch(e){} }
function subscribeChat(){
  if(!S.db||!S.me) return; S.chat.unsub&&S.chat.unsub();
  const sortTs=a=>a.sort((x,y)=>(x.ts||0)-(y.ts||0));
  if(isOwnerChat()){
    S.chat.unsub=S.db.collection("soporte").onSnapshot(sn=>{ S.chat.threads=sn.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.ultimo||0)-(a.ultimo||0)); renderChat(); },e=>console.error(e));
  } else {
    S.chat.unsub=S.db.collection(`soporte/${S.me.usuario}/mensajes`).onSnapshot(sn=>{ S.chat.msgs=sortTs(sn.docs.map(d=>({id:d.id,...d.data()}))); if(S.chat.open) markSeen(); renderChat(); },e=>console.error(e));
  }
}
function openThread(u){
  closeThread(); S.chat.sel=u;
  S.chat.unsubSel=S.db.collection(`soporte/${u}/mensajes`).onSnapshot(sn=>{ S.chat.selMsgs=sn.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(x.ts||0)-(y.ts||0)); renderChat(); },e=>console.error(e));
  const t=S.chat.threads.find(x=>x.id===u); if(t&&t.pendiente) S.db.doc("soporte/"+u).update({pendiente:false}).catch(()=>{});
  renderChat(true);
}
function closeThread(){ S.chat.unsubSel&&S.chat.unsubSel(); S.chat.unsubSel=null; S.chat.sel=null; S.chat.selMsgs=[]; }
function chatBadge(){
  if(isOwnerChat()) return S.chat.threads.filter(t=>t.pendiente).length;
  const seen=getSeen(); return S.chat.open?0:S.chat.msgs.filter(m=>m.de==="diego"&&(m.ts||0)>seen).length;
}
function bubbles(msgs, mineSide){
  return msgs.map(m=>`<div class="msg ${m.de===mineSide?"me":"them"}">${esc(m.texto)}<time>${hora(m.ts)}${m.auto?" · respuesta automática":""}</time></div>`).join("");
}
function chatBodyHTML(){
  if(isOwnerChat()){
    if(!S.chat.sel) return S.chat.threads.length?S.chat.threads.map(t=>`<div class="thread" data-act="chat-thread" data-id="${esc(t.id)}"><span class="dot ${t.pendiente?"":"off"}"></span><div style="min-width:0"><b>${esc(t.nombre||t.id)}</b><small>${esc(t.ultimoTexto||"")}</small></div><span class="note" style="margin-left:auto;white-space:nowrap">${t.ultimo?hora(t.ultimo):""}</span></div>`).join("")
      :`<div class="empty" style="padding:30px 10px">Aún no hay mensajes del equipo.</div>`;
    return bubbles(S.chat.selMsgs,"diego")||`<div class="empty">Sin mensajes.</div>`;
  }
  const first=(S.me.nombre||"").split(" ")[0];
  return `<div class="msg them">¡Hola ${esc(first)}! ¿Tienes una consulta, una sugerencia de mejora o necesitas ayuda con la herramienta? Escríbeme por aquí.</div>`+bubbles(S.chat.msgs,"usuario");
}
function renderChat(full){
  const el=document.getElementById("precios-chat"); if(!el) return; if(!S.me){ el.innerHTML=""; return; }
  const n=chatBadge(); const ae=document.activeElement;
  if(!full && ae && ae.id==="precios-chat-input"){ const body=el.querySelector(".chat-body"); if(body){ body.innerHTML=chatBodyHTML(); body.scrollTop=body.scrollHeight; } return; }
  const draft=document.getElementById("precios-chat-input")?.value||"";
  const owner=isOwnerChat(), sel=S.chat.sel, t=sel?S.chat.threads.find(x=>x.id===sel):null;
  const head=owner?(sel?`<button data-act="chat-back" aria-label="Volver" style="margin:0;font-size:16px">←</button><div><b>${esc(t?.nombre||sel)}</b><small>Conversación con el equipo</small></div>`
      :`<div class="av">${AVATAR}</div><div><b>Bandeja de mensajes</b><small>${S.chat.threads.length} conversaci${S.chat.threads.length===1?"ón":"ones"}</small></div>`)
    :`<div class="av">${AVATAR}</div><div><b>Diego</b><small>Comercial · Estudio de precios</small></div>`;
  const canType=(!owner||!!sel)&&S.canWrite;
  el.innerHTML=`${!owner&&!S.chat.open?`<button class="chat-hola" data-act="chat-toggle" tabindex="-1" aria-hidden="true">¡Hola!</button>`:""}<button class="chat-fab" data-act="chat-toggle" aria-label="${owner?"Bandeja de mensajes":"Escribir a Diego"}">${AVATAR}${n?`<span class="badge">${n}</span>`:""}</button>
  ${S.chat.open?`<section class="chat-panel" role="dialog" aria-label="Chat con Diego">
    <div class="chat-h">${head}<button data-act="chat-close" aria-label="Cerrar">✕</button></div>
    <div class="chat-body" ${owner&&!sel?'style="padding:0;gap:0;background:var(--surface)"':""}>${chatBodyHTML()}</div>
    ${canType?`<form id="precios-chat-form" class="chat-f" novalidate><textarea id="precios-chat-input" placeholder="${owner?"Responder…":"Escribe tu mensaje…"}" rows="1"></textarea><button class="btn primary" type="submit" ${S.chat.sending?"disabled":""}>Enviar</button></form>`:(!S.canWrite?`<div class="chat-f"><span class="note">No se pudo conectar el chat. Recarga la página.</span></div>`:"")}
  </section>`:""}`;
  const inp=document.getElementById("precios-chat-input"); if(inp&&draft) inp.value=draft;
  const body=el.querySelector(".chat-body"); if(body&&!(owner&&!sel)) body.scrollTop=body.scrollHeight;
}
async function chatSend(){
  const inp=document.getElementById("precios-chat-input"); const texto=(inp?.value||"").trim(); if(!texto||S.chat.sending) return;
  S.chat.sending=true; const now=Date.now();
  try{
    if(isOwnerChat()){
      const u=S.chat.sel; if(!u) return;
      await S.db.collection(`soporte/${u}/mensajes`).add({de:"diego", autor:S.me.usuario, texto, ts:now});
      await S.db.doc("soporte/"+u).update({ultimo:now, ultimoTexto:"Tú: "+texto.slice(0,120), pendiente:false});
    } else {
      const u=S.me.usuario, col=S.db.collection(`soporte/${u}/mensajes`);
      const msgs=S.chat.msgs; let iHuman=-1; msgs.forEach((m,i)=>{ if(m.de==="diego"&&!m.auto) iHuman=i; });
      const needAuto=!msgs.slice(iHuman+1).some(m=>m.auto);
      await col.add({de:"usuario", autor:u, texto, ts:now});
      if(needAuto) await col.add({de:"diego", auto:true, texto:`¡Hola ${(S.me.nombre||"").split(" ")[0]}! Gracias por escribir. Recibí tu mensaje y lo revisaré lo antes posible.`, ts:now+1});
      await S.db.doc("soporte/"+u).set({usuario:u, nombre:S.me.nombre, ultimo:now, ultimoTexto:texto.slice(0,140), pendiente:true});
      markSeen();
    }
    const ci=document.getElementById("precios-chat-input"); if(ci) ci.value=""; if(inp) inp.value="";
  }catch(e){ if(e?.code==="invalid_argument"){ S.canWrite=false; toast("Tu acceso es de solo lectura: no puedes enviar mensajes."); } else toast("No se pudo enviar el mensaje. Intenta de nuevo."); console.error(e); }
  finally{ S.chat.sending=false; renderChat(true); document.getElementById("precios-chat-input")?.focus(); }
}

/* ---------- conexión con el servidor de MarketView (ctx.api → api_precios_* en Precios.gs) ---------- */
const CACHE = {plantas:[],productos:[],precios:[],cotizaciones:[],usuarios:[],hilos:[],mensajes:[],config:null};
const LST = new Set();
function fuente(path){
  if(path==="maestro/v1") return {key:"config", doc:true};
  const m=path.match(/^soporte\/([^/]+)\/mensajes$/); if(m) return {key:"mensajes", f:r=>r.hilo===m[1]};
  return {key:{"plantas":"plantas","maestro/v1/productos":"productos","maestro/v1/precios":"precios","maestro/v1/usuarios":"usuarios","cotizaciones":"cotizaciones","soporte":"hilos"}[path]};
}
function emitir(L){
  const s=fuente(L.path); if(!s.key) return;
  if(s.doc){ const c=CACHE.config; L.next({exists:!!c, data:()=>c}); return; }
  let rows=CACHE[s.key]||[]; if(s.f) rows=rows.filter(s.f);
  const docs=rows.map(r=>({id:r.id, exists:true, data:()=>r})); L.next({docs, size:docs.length, empty:!docs.length});
}
/** Llama a precios.<accion>. Los errores conservan los códigos que usa el resto del módulo (fail()). */
async function api(accion, args, opts){
  try{ return await CTX.api("precios."+accion, args||{}, opts); }
  catch(e){ const err=new Error(e&&e.message||String(e)); err.codigo=e&&e.codigo;
    err.code=err.codigo==="permiso"?"invalid_argument":err.codigo==="sesion"?"revoked":"unavailable"; throw err; }
}
let refrescando=null;
// Aplica los datos y dibuja la pantalla una sola vez (no una vez por tabla).
function aplicar(d){ if(!d) return; const {me,...t}=d; if(me) actualizarYo(me); Object.assign(CACHE,t); S._lote=true; try{ LST.forEach(emitir); } finally{ S._lote=false; } render(); }
function refrescar(){
  if(!S.me||!S.ready) return Promise.resolve(); if(refrescando) return refrescando;
  refrescando=(async()=>{ try{ aplicar(await api("cargar")); }catch(e){ console.error(e); } finally{ refrescando=null; } })();
  return refrescando;
}
async function escribir(op, path, data){
  if(soloConsulta() && !String(path).startsWith("soporte/")){ toast(SIN_AUT); throw Object.assign(new Error(SIN_AUT),{code:"sin_autorizacion"}); }
  const r=await api("escribir", {op, path, data:data||null}); if(r&&r.datos){ aplicar(r.datos); delete r.datos; } else await refrescar(); return r; }
function colRef(path){ return { path,
  onSnapshot(next){ const L={path,next}; LST.add(L); setTimeout(()=>emitir(L),0); return ()=>LST.delete(L); },
  add:async d=>{ const r=await escribir("add",path,d); return docRef(path+"/"+r.id); },
  doc:id=>docRef(path+"/"+id) }; }
function docRef(path){ return { id:path.split("/").pop(), path,
  set:d=>escribir("set",path,d), update:d=>escribir("update",path,d), delete:()=>escribir("delete",path,null),
  onSnapshot(next){ const L={path,next}; LST.add(L); setTimeout(()=>emitir(L),0); return ()=>LST.delete(L); },
  collection:sub=>colRef(path+"/"+sub) }; }

/* Fotos grandes: se reducen en el teléfono antes de subirlas (máx. 2400 px, JPEG 85 %), para no acercarse al límite de 6 min del servidor. */
const MAX_ANEXO = 20*1048576;
async function reducirImagen(file){
  if(!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type||"") || file.size<1.5*1048576) return file;
  try{
    const bmp=await createImageBitmap(file); const k=Math.min(1, 2400/Math.max(bmp.width,bmp.height));
    const c=document.createElement("canvas"); c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k);
    const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height); g.drawImage(bmp,0,0,c.width,c.height); if(bmp.close) bmp.close();
    const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",0.85)); if(!blob||blob.size>=file.size) return file;
    return new File([blob], file.name.replace(/\.[A-Za-z0-9]{1,6}$/,"")+".jpg", {type:"image/jpeg"});
  }catch(e){ return file; }
}
const ASSETS = { upload:async (file0, meta)=>{
  const file=await reducirImagen(file0);
  if(file.size>MAX_ANEXO) throw Object.assign(new Error("El archivo pasa de 20 MB."),{code:"muy_grande"});
  const b64=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result).split(",")[1]||""); fr.onerror=()=>rej(Object.assign(new Error("No se pudo leer el archivo."),{code:"upstream_error"})); fr.readAsDataURL(file); });
  const r=await api("subirAnexo", {base64:b64, nombre:file.name, tipo:file.type||"application/octet-stream", meta:meta||{}});   // ctx.api espera hasta 300 s en «subir…»
  return {id:r.id, url:r.url, nombre:r.nombre, contentType:r.tipo, sizeBytes:r.bytes}; } };
const DL = { save:async({filename,data})=>{ const blob=new Blob([data],{type:"text/csv;charset=utf-8"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500); } };

/* ---------- arranque del módulo ---------- */
function suscribir(){
  S.db={collection:colRef, doc:docRef}; S.assets=ASSETS; S.dl=DL; S.canWrite=true;
  const sub=(ref,key)=>ref.onSnapshot(snap=>{ S[key]=snap.docs.map(d=>({id:d.id,...d.data()})); render(); });
  sub(S.db.collection("plantas"),"plantas");
  sub(S.db.collection("maestro/v1/productos"),"productos");
  sub(S.db.collection("maestro/v1/precios"),"precios");
  sub(S.db.collection("cotizaciones"),"cotiz");
  sub(S.db.collection("maestro/v1/usuarios"),"usuarios");
  S.db.doc("maestro/v1").onSnapshot(s=>{ S.config=s.exists?{tramos:{},isv:15,...s.data()}:{tramos:{},isv:15}; render(); });
}
/** El rol o el permiso de coanfitrión pueden cambiar en la Hoja: se aplican sin volver a entrar. */
function actualizarYo(me){
  if(!S.me) return startSession(me);
  if(S.me.rol!==me.rol||S.me.coanfitrion!==(me.coanfitrion===true)){ S.me.rol=me.rol||"visualizador"; S.me.coanfitrion=me.coanfitrion===true; S.canEdit=S.me.rol==="editor"; }
}
/** Enlaces directos: #precios?vista=historial&negocio=bloques&mercado=…&planta=santa-martha */
function aplicarParams(p){
  if(!p) return;
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  if(p.vista && VISTAS.editor.includes(p.vista)) S.view=p.vista;
  if(p.negocio && NEGL[p.negocio]){ S.f.neg=p.negocio; S.reg.neg=p.negocio; S.pr.neg=p.negocio; S.h.neg=p.negocio; S.reg.items=[]; }
  if(p.mercado){ const m=allMercados().find(x=>x===p.mercado||norm(x)===norm(p.mercado)); if(m){ S.f.mercado=m; S.h.mercado=m; } }
  if(p.planta){ const q=norm(p.planta), pl=S.plantas.find(x=>x.id===p.planta)||S.plantas.find(x=>x.id.endsWith(q))||S.plantas.find(x=>norm(x.nombre).includes(q));
    if(pl){ if(pl.tipo==="propia"){ S.f.own=pl.id; S.pr.planta=pl.id; } if(pl.mercado){ S.f.mercado=pl.mercado; S.h.mercado=pl.mercado; } } }
}
function cargarFuenteNumeros(){
  if(document.getElementById("precios-fuente")) return;
  const l=document.createElement("link"); l.id="precios-fuente"; l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"; document.head.appendChild(l);
}
let visible=false, tRefresco=0;
function arrancarRefresco(){ clearInterval(tRefresco); tRefresco=setInterval(()=>{ if(visible&&S.me&&!document.hidden) refrescar(); }, 30000); }
document.addEventListener("visibilitychange",()=>{ if(visible&&!document.hidden&&S.me) refrescar(); });
const SECCIONES=[["comparar","Comparador"],["registrar","Registrar cotización"],["historial","Historial"],["precios","Precios Duracreto"],["catalogo","Catálogo"]];

MV.registrar("precios", {
  relleno:false,
  async montar(el, ctx){
    CTX=ctx; MODEL=el; cargarFuenteNumeros();
    el.innerHTML=`<div class="precios-raiz">
      <nav class="precios-tabs" id="precios-nav" aria-label="Secciones del estudio de precios" hidden>${SECCIONES.map(([k,l])=>`<button type="button" data-view="${k}">${l}</button>`).join("")}</nav>
      <div class="precios-main" id="precios-app"><div class="mv-pronto"><span class="mv-giro" style="width:28px;height:28px;color:var(--accent)"></span><p>Cargando el estudio de precios…</p></div></div>
      <div id="precios-overlay"></div><div id="precios-chat"></div></div>`;
    RAIZ=el.firstElementChild;
    OYENTES.forEach(([t,f])=>{ if(t==="keydown") document.addEventListener(t, e=>{ if(visible) f(e); }); else RAIZ.addEventListener(t,f); });
    RAIZ.querySelector("#precios-nav").addEventListener("click",e=>{ const b=e.target.closest("button[data-view]"); if(b) go(b.dataset.view); });
    suscribir();
    const u=ctx.usuario;
    startSession({id:u.id, nombre:u.nombre, rol:ctx.rol, cargo:u.cargo, inicio:u.inicio, coanfitrion:false});
    const d=await api("cargar");          // si falla, el cascarón muestra «Intentar de nuevo»
    S.ready=true; aplicar(d); aplicarParams(ctx.params); visible=true; rerender(); arrancarRefresco();
  },
  mostrar(ctx){
    CTX=ctx; visible=true;
    if(ctx.params&&Object.keys(ctx.params).length){ aplicarParams(ctx.params); rerender(); }
    refrescar(); arrancarRefresco();
  },
  ocultar(){ visible=false; clearInterval(tRefresco); cerrarMapa(); if(S.chat.open){ S.chat.open=false; renderChat(true); } }
});
})();
