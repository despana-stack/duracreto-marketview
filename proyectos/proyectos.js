/* Duracreto MarketView — módulo «Mis proyectos» (chat Mapa de mercado).
 *
 * Los asesores registran sus proyectos y cambian el estado en un toque. Datos: ctx.api('proyectos.*') → apps-script/Proyectos.gs.
 * Permisos (rol del módulo, hereda de «Mapa»): asesor y editor registran; visualizador y consulta solo miran.
 * Un asesor solo ve y cambia sus proyectos; editor y verTodo ven todos, con selector de asesor.
 * Deep links: #proyectos?editar=PRY-0123 abre el formulario de ese proyecto (lo usa el botón «Actualizar» del mapa);
 *             #proyectos?nuevo=1 abre el formulario vacío.
 * El formulario y el diálogo van en document.body (clase .proy-flotante) para cubrir toda la pantalla.
 */
(function () {
'use strict';

const LEAFLET = { css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css', js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
  altCss: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', alt: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js' };
const OSM = 'https://tile.openstreetmap.org/';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ESTADOS = [
  { k: 'ganado', n: 'Ganado' }, { k: 'perspectiva', n: 'Perspectiva' },
  { k: 'competencia', n: 'Competencia' }, { k: 'perdido', n: 'Perdido' }, { k: 'sinestado', n: 'Sin estado' }
];
const TIPOS = ['vertical', 'casa', 'industria', 'vial', 'otro'];
const SEG_CORTO = { vertical: 'Vertical', casa: 'Horizontal', industria: 'Industrial', vial: 'Vial', otro: 'Otro' };
/* Ícono ilustrado del proyecto según su tipo (la misma tabla está en mapa/mapa.js). */
const SEG_ICO = {
  vertical: '<rect x="4.5" y="3" width="9.5" height="18" rx="1.2" fill="#4F7CB3"/><rect x="14" y="8.5" width="5.5" height="12.5" rx="1" fill="#8EB0D8"/><g fill="#E6F0FB"><rect x="6.5" y="5.5" width="2" height="2"/><rect x="10" y="5.5" width="2" height="2"/><rect x="6.5" y="9.5" width="2" height="2"/><rect x="10" y="9.5" width="2" height="2"/><rect x="6.5" y="13.5" width="2" height="2"/><rect x="10" y="13.5" width="2" height="2"/><rect x="15.8" y="11" width="2" height="1.6"/><rect x="15.8" y="14.3" width="2" height="1.6"/></g><rect x="8.2" y="17.5" width="2.4" height="3.5" fill="#2E4F78"/>',
  casa: '<path d="M2.5 12.5L8.5 7l6 5.5z" fill="#D9542C"/><rect x="4" y="12" width="9" height="8.5" fill="#F4DDB5"/><rect x="7.4" y="15.2" width="2.3" height="5.3" fill="#8B5A3C"/><path d="M12 13.5l4.8-4.3 4.7 4.3z" fill="#E8794E"/><rect x="13" y="13.2" width="7.4" height="7.3" fill="#FBE9CC"/><rect x="15.3" y="15.6" width="2.4" height="2.2" fill="#7FB0D9"/><rect x="2" y="20.3" width="20" height="1.2" rx=".6" fill="#7BA05B"/>',
  industria: '<rect x="15.6" y="3.5" width="2.8" height="9" fill="#6E747D"/><path d="M2.5 21V11.2l5 3.1v-3.1l5 3.1v-3.1l5 3.1V21z" fill="#959CA6"/><g fill="#F9C200"><rect x="5" y="16" width="2.4" height="2.2"/><rect x="10" y="16" width="2.4" height="2.2"/><rect x="15" y="16" width="2.4" height="2.2"/></g><path d="M16.5 3.5c0-1.3 1.8-1.6 2.6-.7" stroke="#B9BEC5" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
  vial: '<path d="M8.8 3h6.4L21 21H3z" fill="#4D535C"/><path d="M12 4.8v2.6M12 10v3M12 15.8v3.6" stroke="#F9C200" stroke-width="1.7" stroke-linecap="round"/><path d="M8.8 3L3 21M15.2 3L21 21" stroke="#E9ECEF" stroke-width="1"/>',
  otro: '<path d="M9.6 3.5h4.8l4 15.5H5.6z" fill="#F07800"/><path d="M8.4 9h7.2M7.1 14h9.8" stroke="#fff" stroke-width="2"/><rect x="3.5" y="18.8" width="17" height="2.4" rx="1.2" fill="#6B6B68"/>'
};
const IC_BUSCAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

/* ---------- utilidades ---------- */
const $ = id => document.getElementById('proy-' + id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const NF = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 1 });
const fmt = n => NF.format(Number(n) || 0);
const fmtMes = m => { const x = String(m || '').match(/^(\d{4})-(\d{2})/); return x ? MESES[Number(x[2]) - 1] + ' ' + x[1] : String(m || ''); };
const estadoK = e => { const n = norm(e); if (n === 'ganado') return 'ganado'; if (n === 'perspectiva') return 'perspectiva'; if (n.indexOf('competencia') === 0) return 'competencia'; if (n === 'perdido') return 'perdido'; return 'sinestado'; };
const estadoN = k => (ESTADOS.find(e => e.k === k) || ESTADOS[4]).n;
const esAprox = p => /^s[ií]/i.test(String(p.aprox || ''));
const activo = a => /^s[ií]/i.test(String(a.activo || ''));
const segK = p => { const n = norm(p.segmento) + ' ' + norm(p.tipo); if (/vertical|torre|edificio|apartament/.test(n)) return 'vertical'; if (/horizontal|residencial|urbaniz|casa|vivienda|condomin/.test(n)) return 'casa'; if (/industrial|bodega|nave|planta/.test(n)) return 'industria'; if (/vial|infraestructura|pavimen|puente|carretera|desnivel/.test(n)) return 'vial'; return 'otro'; };
const icoSeg = (sk, t) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" aria-hidden="true">${SEG_ICO[sk]}</svg>`;
const pinSvg = (ek, sk, aprox, w) => `<span class="mk${aprox ? ' ax' : ''}" style="width:${w}px;height:${w}px;border-color:var(--proy-${ek})">${icoSeg(sk, Math.round(w * .64))}</span>`;
function aviso(m, tipo) { if (CTX) CTX.aviso(m, tipo); }

/* Reparto mensual estimado según el tipo (misma fórmula que proyPesos_ en apps-script/Proyectos.gs). */
function repartoMeses(tipo, vol, mes, plazo) {
  const n = Math.max(1, Math.min(60, Number(plazo) || 0)), w = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? .5 : i / (n - 1), c = Math.sin(Math.PI * (i + .5) / n);
    w.push(tipo === 'vertical' ? (i === 0 ? 1.8 : (i < Math.ceil(n * .2) ? 1.3 : 1 - .35 * x)) : tipo === 'casa' ? .6 + c : tipo === 'industria' ? .6 + .9 * x : tipo === 'vial' ? .25 + c : 1);
  }
  const t = w.reduce((a, b) => a + b, 0); let y = Number(String(mes).slice(0, 4)), m = Number(String(mes).slice(5, 7)), suma = 0; const out = [];
  for (let i = 0; i < n; i++) {
    const k = y + '-' + String(m).padStart(2, '0');
    const v = i === n - 1 ? Math.round((vol - suma) * 10) / 10 : Math.round(vol * w[i] / t * 10) / 10;
    out.push([k, v]); suma = Math.round((suma + v) * 10) / 10; m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/* ---------- estado ---------- */
let CTX = null, RAIZ = null, D = null, refrescando = null;
const MIS = { estado: 'perspectiva', q: '', asesor: null, max: 60, visible: true, sucio: false, cargado: 0, pendiente: null };
const FP = { p: null, d: null, map: null, marca: null, lugares: [], el: null, scrim: null, dlg: null };
const vivo = () => !!(RAIZ && RAIZ.isConnected);
const miNombre = () => (D && (D.miNombre || D.miAsesor)) || (CTX && CTX.usuario.nombre) || '';
const puedeEditar = p => !!(D && D.registrar && (D.gestiona || norm(p.asesor) === norm(miNombre())));
const verMapa = () => !!(CTX && CTX.usuario.roles && CTX.usuario.roles.mapa);

async function refrescar() {
  if (!vivo() || refrescando) return refrescando || undefined;
  refrescando = (async () => { try { aplicar(await CTX.api('proyectos.cargar')); } catch (e) { console.error(e); } finally { refrescando = null; } })();
  return refrescando;
}
function aplicar(d) { if (!d) return; D = d; MIS.cargado = Date.now(); if (vivo() && (!FP.el || FP.el.hidden)) pintar(); }
/* Avisa al mapa que la base cambió, para que se actualice al volver. */
function avisarCambio() { window.dispatchEvent(new CustomEvent('mv-mapa:cambio', { detail: { origen: 'proyectos' } })); }
window.addEventListener('mv-mapa:cambio', e => {
  if (!vivo() || (e.detail && e.detail.origen === 'proyectos')) return;
  MIS.sucio = true;
  if (MIS.visible && !document.hidden) { MIS.sucio = false; refrescar(); }
});

/* ---------- lista ---------- */
function pintar() {
  if (!vivo() || !D) return;
  const d = D, gest = !!d.gestiona;
  if (MIS.asesor === null) MIS.asesor = gest ? (d.miAsesor || '') : miNombre();
  const base = d.proyectos.filter(p => gest ? (!MIS.asesor || (MIS.asesor === '__sin' ? !p.asesor : norm(p.asesor) === norm(MIS.asesor))) : norm(p.asesor) === norm(miNombre()));
  const q = norm(MIS.q);
  const conQ = base.filter(p => !q || norm([p.cliente, p.proyecto, p.id].join(' ')).indexOf(q) >= 0);
  const cnt = {}; conQ.forEach(p => { const k = estadoK(p.estado); cnt[k] = (cnt[k] || 0) + 1; });
  const lista = conQ.filter(p => MIS.estado === 'todos' || estadoK(p.estado) === MIS.estado)
    .sort((a, b) => String(a.mes || '9999').localeCompare(String(b.mes || '9999')) || (Number(b.vol) || 0) - (Number(a.vol) || 0));
  const asesores = [...new Set(d.asesores.filter(activo).map(a => a.nombre))].sort((a, b) => a.localeCompare(b, 'es'));
  const pestanas = [['perspectiva', 'Perspectiva'], ['ganado', 'Ganado'], ['competencia', 'Competencia'], ['perdido', 'Perdido'], ['todos', 'Todos']];
  const tenia = document.activeElement && document.activeElement.id === 'proy-q';
  RAIZ.innerHTML = `<div class="proy-raiz"><div class="pagina-in">
    <div class="pag-h"><div><h1>${gest ? 'Proyectos del equipo' : 'Mis proyectos'}</h1><p>${gest ? 'Registre o actualice proyectos de cualquier asesor.' : 'Registre sus proyectos y actualice el estado cuando se gane o se pierda.'}</p></div>
      ${d.registrar ? `<button type="button" class="mv-btn primario" data-accion="nuevo">+ Registrar proyecto</button>` : ''}</div>
    ${d.registrar ? '' : `<p class="nota">Su usuario es de consulta: puede ver los proyectos, pero no registrarlos.</p>`}
    <div class="barra-f">
      <div class="buscar">${IC_BUSCAR}<input type="search" id="proy-q" class="mv-input" placeholder="Buscar cliente o proyecto" value="${esc(MIS.q)}" autocomplete="off"></div>
      ${gest ? `<select id="proy-asesor" class="mv-input" aria-label="Asesor"><option value="">Todos los asesores</option>${asesores.map(a => `<option${norm(a) === norm(MIS.asesor) ? ' selected' : ''}>${esc(a)}</option>`).join('')}<option value="__sin"${MIS.asesor === '__sin' ? ' selected' : ''}>Sin asesor asignado</option></select>` : ''}
    </div>
    <div class="pills" role="tablist">${pestanas.map(([k, n]) => `<button type="button" class="pill" data-est="${k}" aria-pressed="${MIS.estado === k}">${k !== 'todos' ? `<i class="e-${k}"></i>` : ''}${n}<small>${k === 'todos' ? conQ.length : (cnt[k] || 0)}</small></button>`).join('')}</div>
    <div class="tarjetas">${lista.length ? lista.slice(0, MIS.max).map(tarjeta).join('') : `<div class="vacio">${base.length ? 'No hay proyectos en esta pestaña.' : 'Aún no tiene proyectos registrados.'}${d.registrar ? `<br><br><button type="button" class="mv-btn primario" data-accion="nuevo">+ Registrar el primero</button>` : ''}</div>`}</div>
    ${lista.length > MIS.max ? `<button type="button" class="mv-btn" data-accion="mas">Ver ${Math.min(60, lista.length - MIS.max)} más</button>` : ''}
    <p class="leido">Datos de la base al ${esc(d.leido || '')}</p>
  </div></div>`;
  if (tenia) { const i = $('q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function tarjeta(p) {
  const ek = estadoK(p.estado), ed = puedeEditar(p);
  return `<article class="tj">${pinSvg(ek, segK(p), esAprox(p), 32)}
    <div><h3>${esc(p.proyecto || 'Sin nombre')}</h3><div class="cli">${esc(p.cliente || '')}${D.gestiona && p.asesor ? ' · ' + esc(p.asesor) : ''}</div></div>
    <div class="datos">${p.vol ? `<span><b>${fmt(p.vol)}</b> m³</span>` : ''}${p.mes ? `<span>Inicio <b>${fmtMes(p.mes)}</b></span>` : ''}${p.plazo ? `<span><b>${p.plazo}</b> ${Number(p.plazo) === 1 ? 'mes' : 'meses'}</span>` : ''}${p.comp ? `<span>Competencia: <b>${esc(p.comp)}</b></span>` : ''}<span>${esc(p.id)}</span></div>
    ${esAprox(p) && ed ? `<div class="warn">La ubicación es aproximada: ábralo y marque el punto exacto en el mapa.</div>` : ''}
    <div class="acc">
      ${ed ? `<div class="estsel" role="group" aria-label="Estado">${['perspectiva', 'ganado', 'competencia'].map(k => `<button type="button" data-est-p="${esc(p.id)}" data-est-v="${k}" aria-pressed="${ek === k}"><i class="e-${k}"></i>${estadoN(k)}</button>`).join('')}</div>` : `<span class="chip"><i class="e-${ek}"></i>${estadoN(ek)}</span>`}
      <span style="flex:1"></span>
      ${p.lat != null && verMapa() ? `<button type="button" class="btn ghost" data-ver="${esc(p.id)}">Ver en el mapa</button>` : ''}
      ${ed ? `<button type="button" class="btn" data-editar="${esc(p.id)}">Editar</button>` : ''}
    </div></article>`;
}
function eventosLista() {
  RAIZ.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b || !D) return;
    const p = id => D.proyectos.find(x => x.id === id);
    if (b.dataset.accion === 'nuevo') { abrirFormulario(null); return; }
    if (b.dataset.accion === 'mas') { MIS.max += 60; pintar(); return; }
    if (b.dataset.est) { MIS.estado = b.dataset.est; MIS.max = 60; pintar(); return; }
    if (b.dataset.editar) { abrirFormulario(p(b.dataset.editar)); return; }
    if (b.dataset.ver) { CTX.abrir('mapa', { id: b.dataset.ver }); return; }
    if (b.dataset.estP) {
      const pr = p(b.dataset.estP), k = b.dataset.estV; if (!pr || estadoK(pr.estado) === k) return;
      let comp = '';
      if (k === 'competencia') { comp = await pedirCompetidor(pr.comp); if (comp === null) return; }
      b.disabled = true;
      try { const r = await CTX.api('proyectos.estado', { id: pr.id, estado: estadoN(k), comp }); aplicar(r.datos); avisarCambio(); aviso(`${pr.proyecto || pr.id}: ${estadoN(k)}.`); }
      catch (e) { b.disabled = false; aviso(e.message || 'No se pudo guardar.', 'error'); }
    }
  });
  RAIZ.addEventListener('change', ev => { if (ev.target.id === 'proy-asesor') { MIS.asesor = ev.target.value; MIS.max = 60; pintar(); } });
  let tq;
  RAIZ.addEventListener('input', ev => { if (ev.target.id === 'proy-q') { const v = ev.target.value; clearTimeout(tq); tq = setTimeout(() => { MIS.q = v; pintar(); }, 250); } });
}

/* ---------- capas flotantes (formulario y diálogo) ---------- */
function flotantes() {
  if (FP.el && FP.el.isConnected) return;
  FP.scrim = document.createElement('div'); FP.scrim.className = 'proy-flotante proy-scrim'; FP.scrim.hidden = true;
  FP.el = document.createElement('aside'); FP.el.className = 'proy-flotante proy-drawer'; FP.el.hidden = true; FP.el.setAttribute('aria-label', 'Formulario de proyecto');
  FP.dlg = document.createElement('div'); FP.dlg.className = 'proy-flotante proy-dlg'; FP.dlg.hidden = true;
  document.body.append(FP.scrim, FP.el, FP.dlg);
  FP.scrim.addEventListener('click', cerrarFormulario);
  FP.el.addEventListener('click', clicFormulario);
  FP.el.addEventListener('input', ev => { if (ev.target.id === 'proy-fp-vol') pintarReparto(); });
  FP.el.addEventListener('change', ev => {
    if (ev.target.id === 'proy-fp-mes' || ev.target.id === 'proy-fp-plazo') pintarReparto();
    if (ev.target.id === 'proy-fp-comp') $('fp-comp-otro').hidden = ev.target.value !== '__otro';
  });
}
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || !FP.el || FP.el.hidden) return;
  if (FP.dlg && !FP.dlg.hidden) return;
  cerrarFormulario();
});

/* Diálogo simple para elegir el competidor */
function pedirCompetidor(actual) {
  flotantes();
  return new Promise(res => {
    const comps = D.competidores || [], dlg = FP.dlg;
    dlg.innerHTML = `<div class="dlg-c" role="dialog" aria-modal="true" aria-labelledby="proy-dlg-t"><h3 id="proy-dlg-t">¿Con qué competidor está?</h3>
      <select id="proy-dlg-sel" class="mv-input"><option value="">Elija el competidor</option>${comps.map(c => `<option${norm(c) === norm(actual) ? ' selected' : ''}>${esc(c)}</option>`).join('')}<option value="__otro">Otro (escribir)</option></select>
      <input type="text" id="proy-dlg-otro" class="mv-input" placeholder="Nombre del competidor" hidden>
      <span class="err" id="proy-dlg-err"></span>
      <div class="fila-b" style="justify-content:flex-end"><button type="button" class="mv-btn" id="proy-dlg-no">Cancelar</button><button type="button" class="mv-btn primario" id="proy-dlg-ok">Guardar</button></div></div>`;
    dlg.hidden = false;
    const sel = $('dlg-sel'), otro = $('dlg-otro');
    sel.onchange = () => { otro.hidden = sel.value !== '__otro'; if (!otro.hidden) otro.focus(); };
    const fin = v => { dlg.hidden = true; dlg.innerHTML = ''; document.removeEventListener('keydown', esc1); res(v); };
    const esc1 = e => { if (e.key === 'Escape') fin(null); };
    document.addEventListener('keydown', esc1);
    dlg.onclick = e => { if (e.target === dlg) fin(null); };
    $('dlg-no').onclick = () => fin(null);
    $('dlg-ok').onclick = () => { const v = sel.value === '__otro' ? otro.value.trim() : sel.value; if (!v) { $('dlg-err').textContent = 'Elija o escriba el competidor.'; return; } fin(v); };
    sel.focus();
  });
}

/* ---------- formulario ---------- */
function mesesOpciones(sel) {
  const hoy = new Date(), out = []; let y = hoy.getFullYear(), m = hoy.getMonth() + 1 - 6;
  while (m < 1) { m += 12; y--; }
  for (let i = 0; i < 31; i++) { const k = y + '-' + String(m).padStart(2, '0'); out.push(`<option value="${k}"${k === sel ? ' selected' : ''}>${fmtMes(k)}</option>`); m++; if (m > 12) { m = 1; y++; } }
  if (sel && out.join('').indexOf(`"${sel}"`) < 0) out.unshift(`<option value="${sel}" selected>${fmtMes(sel)}</option>`);
  return out.join('');
}
function abrirFormulario(p) {
  if (!D || !D.registrar) { aviso('Su usuario no puede registrar proyectos.', 'error'); return; }
  if (p && !puedeEditar(p)) { aviso('Ese proyecto es de otro asesor: no puede modificarlo.', 'error'); return; }
  flotantes();
  const hoy = new Date(), sig = (hoy.getMonth() === 11 ? hoy.getFullYear() + 1 : hoy.getFullYear()) + '-' + String(hoy.getMonth() === 11 ? 1 : hoy.getMonth() + 2).padStart(2, '0');
  FP.p = p; FP.lugares = [];
  FP.d = p ? { id: p.id, cliente: p.cliente || '', proyecto: p.proyecto || '', tipo: segK(p), ref: p.ref || '', lat: p.lat, lng: p.lng, vol: p.vol || '', mes: String(p.mes || '').slice(0, 7) || sig, plazo: p.plazo || '', estado: estadoN(estadoK(p.estado)), comp: p.comp || '', notas: p.notas || '', asesor: p.asesor || '' }
    : { cliente: '', proyecto: '', tipo: '', ref: '', lat: null, lng: null, vol: '', mes: sig, plazo: '', estado: 'Perspectiva', comp: '', notas: '', asesor: D.gestiona ? (D.miAsesor || '') : miNombre() };
  if (FP.d.estado === 'Sin estado') FP.d.estado = 'Perspectiva';
  pintarFormulario();
  FP.scrim.hidden = false; FP.el.hidden = false; FP.el.scrollTop = 0;
  iniciarMiniMapa();
  setTimeout(() => { const i = $('fp-cliente'); if (i && !p) i.focus(); }, 60);
}
function cerrarFormulario() {
  if (!FP.el) return;
  FP.el.hidden = true; FP.scrim.hidden = true; FP.dlg.hidden = true;
  if (FP.map) { FP.map.remove(); FP.map = null; FP.marca = null; }
  if (vivo()) pintar();
}
function pintarFormulario() {
  const d = FP.d, gest = !!D.gestiona;
  const clientes = [...new Set(D.proyectos.map(p => String(p.cliente || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 600);
  const comps = D.competidores || [];
  const asesores = [...new Set(D.asesores.filter(activo).map(a => a.nombre))].sort((a, b) => a.localeCompare(b, 'es'));
  const estados = FP.p ? ['Perspectiva', 'Ganado', 'Competencia', 'Perdido'] : ['Perspectiva', 'Ganado', 'Competencia'];
  const plazos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 24, 30, 36];
  FP.el.innerHTML = `<div class="drawer-h"><h2>${FP.p ? 'Actualizar proyecto' : 'Registrar proyecto'}</h2><button type="button" class="btn ghost" data-fp="cerrar" aria-label="Cerrar">✕</button></div>
    <div class="fp-sec"><span class="lbl"><em>1</em>¿Qué proyecto es?</span>
      <div class="fld"><label for="proy-fp-cliente">Cliente</label><input type="text" class="mv-input" id="proy-fp-cliente" list="proy-fp-clientes" value="${esc(d.cliente)}" placeholder="Empresa o persona" autocomplete="off"><datalist id="proy-fp-clientes">${clientes.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="fld"><label for="proy-fp-proyecto">Nombre del proyecto</label><input type="text" class="mv-input" id="proy-fp-proyecto" value="${esc(d.proyecto)}" placeholder="Ej. Torre Los Álamos, bodega en Choloma"></div>
    </div>
    <div class="fp-sec"><span class="lbl"><em>2</em>Tipo de proyecto</span>
      <div class="tipos">${TIPOS.map(k => `<button type="button" class="tipo" data-fp-tipo="${k}" aria-pressed="${d.tipo === k}">${icoSeg(k, 30)}${SEG_CORTO[k]}</button>`).join('')}</div>
    </div>
    <div class="fp-sec"><span class="lbl"><em>3</em>¿Dónde queda?</span>
      <div class="fila-b"><input type="text" class="mv-input" id="proy-fp-ref" value="${esc(d.ref)}" placeholder="Dirección o referencia (colonia, barrio, ciudad)"><button type="button" class="mv-btn" data-fp="buscar">Buscar</button></div>
      <div id="proy-fp-lugares"></div>
      <div id="proy-fp-mapa"></div>
      <div class="fila-b" style="justify-content:space-between;align-items:center"><span class="nota" id="proy-fp-punto">${d.lat != null ? 'Punto marcado. Puede arrastrarlo para afinarlo.' : 'Toque el mapa para marcar el punto exacto (opcional si escribe la dirección).'}</span><button type="button" class="btn ghost" data-fp="gps">Usar mi ubicación</button></div>
    </div>
    <div class="fp-sec"><span class="lbl"><em>4</em>Volumen y tiempos</span>
      <div class="grid3">
        <div class="fld"><label for="proy-fp-vol">Volumen total (m³)</label><input type="number" class="mv-input" id="proy-fp-vol" min="1" step="0.5" inputmode="decimal" value="${esc(d.vol)}"></div>
        <div class="fld"><label for="proy-fp-mes">Mes de inicio</label><select class="mv-input" id="proy-fp-mes">${mesesOpciones(d.mes)}</select></div>
        <div class="fld"><label for="proy-fp-plazo">Duración</label><select class="mv-input" id="proy-fp-plazo"><option value="">Meses</option>${plazos.map(n => `<option value="${n}"${Number(d.plazo) === n ? ' selected' : ''}>${n} ${n === 1 ? 'mes' : 'meses'}</option>`).join('')}${d.plazo && plazos.indexOf(Number(d.plazo)) < 0 ? `<option value="${esc(d.plazo)}" selected>${esc(d.plazo)} meses</option>` : ''}</select></div>
      </div>
      <div id="proy-fp-reparto"></div>
    </div>
    <div class="fp-sec"><span class="lbl"><em>5</em>Estado</span>
      <div class="estados3${estados.length > 3 ? ' cuatro' : ''}">${estados.map(e => `<button type="button" data-fp-estado="${e}" aria-pressed="${d.estado === e}"><i class="e-${estadoK(e)}"></i>${e}</button>`).join('')}</div>
      <div class="fld" id="proy-fp-comp-w" ${d.estado === 'Competencia' ? '' : 'hidden'}><label for="proy-fp-comp">¿Con qué competidor?</label><select class="mv-input" id="proy-fp-comp"><option value="">Elija el competidor</option>${comps.map(c => `<option${norm(c) === norm(d.comp) ? ' selected' : ''}>${esc(c)}</option>`).join('')}<option value="__otro">Otro (escribir)</option></select><input type="text" class="mv-input" id="proy-fp-comp-otro" placeholder="Nombre del competidor" hidden></div>
    </div>
    ${gest ? `<div class="fld"><label for="proy-fp-asesor">Asesor</label><select class="mv-input" id="proy-fp-asesor"><option value="">Sin asesor asignado</option>${asesores.map(a => `<option${norm(a) === norm(d.asesor) ? ' selected' : ''}>${esc(a)}</option>`).join('')}${d.asesor && !asesores.some(a => norm(a) === norm(d.asesor)) ? `<option selected>${esc(d.asesor)}</option>` : ''}</select></div>` : ''}
    <div class="fld"><label for="proy-fp-notas">Notas (opcional)</label><textarea class="mv-input" id="proy-fp-notas" placeholder="Ej. losas y pavimento; decide el ingeniero residente">${esc(d.notas)}</textarea></div>
    ${FP.p && FP.p.hist ? `<details><summary class="nota" style="cursor:pointer">Historial de cambios</summary><p class="nota" style="white-space:pre-line;margin-top:6px">${esc(FP.p.hist)}</p></details>` : ''}
    <span class="err" id="proy-fp-err"></span>
    <div class="fp-pie"><button type="button" class="mv-btn" data-fp="cerrar">Cancelar</button><button type="button" class="mv-btn primario" data-fp="guardar">${FP.p ? 'Guardar cambios' : 'Registrar proyecto'}</button></div>`;
  pintarReparto();
}
function leerForm() {
  const d = FP.d, v = id => { const e = $(id); return e ? e.value : ''; };
  d.cliente = v('fp-cliente').trim(); d.proyecto = v('fp-proyecto').trim(); d.ref = v('fp-ref').trim();
  d.vol = v('fp-vol'); d.mes = v('fp-mes'); d.plazo = v('fp-plazo'); d.notas = v('fp-notas').trim();
  if ($('fp-asesor')) d.asesor = v('fp-asesor');
  const sel = v('fp-comp'); d.comp = sel === '__otro' ? v('fp-comp-otro').trim() : sel;
  return d;
}
function pintarReparto() {
  const el = $('fp-reparto'); if (!el) return; const d = FP.d;
  const vol = Number($('fp-vol') && $('fp-vol').value), n = Number($('fp-plazo') && $('fp-plazo').value), mes = $('fp-mes') && $('fp-mes').value;
  if (!(vol > 0) || !n || !d.tipo) { el.innerHTML = `<p class="nota">Con el tipo, el volumen y la duración se estima cómo se reparte el volumen por mes.</p>`; return; }
  const r = repartoMeses(d.tipo, vol, mes, n), max = Math.max(...r.map(x => x[1])) || 1;
  el.innerHTML = `<p class="lbl" style="margin:0">Reparto estimado por mes (m³)</p>
    <div class="reparto" aria-hidden="true">${r.map(([k, v]) => `<div style="height:${Math.max(4, v / max * 100)}%" title="${fmtMes(k)}: ${fmt(v)} m³"></div>`).join('')}</div>
    <div class="reparto-l">${r.map(([k]) => `<span>${r.length <= 12 ? MESES[Number(k.slice(5, 7)) - 1] : ''}</span>`).join('')}</div>
    <p class="nota">${r.length <= 6 ? r.map(([k, v]) => `${fmtMes(k)}: ${fmt(v)}`).join(' · ') : `${fmtMes(r[0][0])} a ${fmtMes(r[r.length - 1][0])}; mayor mes ${fmt(max)} m³`}. Es una estimación según el tipo de proyecto.</p>`;
}

/* Mini mapa para marcar el punto. Leaflet se carga aquí si el mapa no lo cargó antes. */
function cargarCss(href) { if (document.querySelector('link[href="' + href + '"]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
function cargarJs(src) { return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok(); s.onerror = () => { s.remove(); mal(new Error(src)); }; document.head.appendChild(s); }); }
let cargandoL = null;
function cargarLeaflet() {
  cargarCss(LEAFLET.css);
  if (window.L) return Promise.resolve();
  return cargandoL || (cargandoL = cargarJs(LEAFLET.js).catch(() => { cargarCss(LEAFLET.altCss); return cargarJs(LEAFLET.alt); }).finally(() => { cargandoL = null; }));
}
async function iniciarMiniMapa() {
  try { await cargarLeaflet(); } catch (e) { const m = $('fp-mapa'); if (m) m.innerHTML = '<p class="nota" style="padding:12px">No se pudo cargar el mapa. Escriba la dirección; se ubicará sola.</p>'; return; }
  if (!FP.el || FP.el.hidden || !$('fp-mapa')) return;
  if (FP.map) { FP.map.remove(); FP.map = null; FP.marca = null; }
  const d = FP.d, c = d.lat != null ? [d.lat, d.lng] : [15.5, -88.0];
  const mm = FP.map = L.map('proy-fp-mapa', { zoomControl: true, attributionControl: false }).setView(c, d.lat != null ? 16 : 12);
  if (CTX.tema() === 'dark') {
    L.tileLayer(ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 16 }).addTo(mm);
    L.tileLayer(ESRI + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 16 }).addTo(mm);
  } else L.tileLayer(OSM + '{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(mm);
  if (d.lat != null) ponerMarca([d.lat, d.lng], false);
  mm.on('click', ev => ponerMarca([ev.latlng.lat, ev.latlng.lng], true));
  setTimeout(() => mm.invalidateSize(), 120);
}
function ponerMarca(ll, centrar) {
  const d = FP.d; d.lat = Math.round(ll[0] * 1e6) / 1e6; d.lng = Math.round(ll[1] * 1e6) / 1e6;
  if (!FP.map) return;
  if (!FP.marca) {
    FP.marca = L.marker(ll, { draggable: true, icon: L.divIcon({ className: 'proy-sin-fondo', html: '<div class="mover-pin"></div>', iconSize: [26, 26], iconAnchor: [13, 30] }) }).addTo(FP.map);
    FP.marca.on('dragend', () => { const p = FP.marca.getLatLng(); FP.d.lat = Math.round(p.lat * 1e6) / 1e6; FP.d.lng = Math.round(p.lng * 1e6) / 1e6; });
  } else FP.marca.setLatLng(ll);
  if (centrar) FP.map.panTo(ll);
  const t = $('fp-punto'); if (t) t.textContent = 'Punto marcado. Puede arrastrarlo para afinarlo.';
}
async function clicFormulario(ev) {
  const b = ev.target.closest('button'); if (!b) return;
  const d = FP.d;
  if (b.dataset.fpTipo) { leerForm(); d.tipo = b.dataset.fpTipo; FP.el.querySelectorAll('[data-fp-tipo]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); pintarReparto(); return; }
  if (b.dataset.fpEstado) { d.estado = b.dataset.fpEstado; FP.el.querySelectorAll('[data-fp-estado]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('fp-comp-w').hidden = d.estado !== 'Competencia'; return; }
  if (b.dataset.lugar !== undefined) { const l = FP.lugares[Number(b.dataset.lugar)]; if (l) { ponerMarca([l.lat, l.lng], true); if (FP.map) FP.map.setZoom(16); $('fp-lugares').innerHTML = ''; } return; }
  const a = b.dataset.fp;
  if (a === 'cerrar') { cerrarFormulario(); return; }
  if (a === 'buscar') {
    const t = $('fp-ref').value.trim(); if (t.length < 3) { aviso('Escriba al menos 3 letras de la dirección.'); return; }
    b.disabled = true; b.textContent = 'Buscando…';
    try {
      FP.lugares = (await CTX.api('proyectos.buscarLugar', { texto: t })) || [];
      $('fp-lugares').innerHTML = FP.lugares.length ? `<div class="lugares">${FP.lugares.map((l, i) => `<button type="button" data-lugar="${i}">${esc(l.nombre)}</button>`).join('')}</div>` : `<p class="nota">No se encontró esa dirección. Marque el punto en el mapa o deje solo la referencia escrita.</p>`;
    } catch (e) { aviso('No se pudo buscar la dirección.', 'error'); }
    finally { b.disabled = false; b.textContent = 'Buscar'; }
    return;
  }
  if (a === 'gps') {
    if (!navigator.geolocation) { aviso('Su navegador no permite usar la ubicación.', 'error'); return; }
    navigator.geolocation.getCurrentPosition(pos => { ponerMarca([pos.coords.latitude, pos.coords.longitude], true); if (FP.map) FP.map.setZoom(17); },
      () => aviso('No se pudo obtener su ubicación. Marque el punto en el mapa.', 'error'), { enableHighAccuracy: true, timeout: 10000 });
    return;
  }
  if (a === 'guardar') {
    leerForm(); const err = $('fp-err'); err.textContent = '';
    const falta = !d.cliente ? 'Escriba el cliente.' : !d.proyecto ? 'Escriba el nombre del proyecto.' : !d.tipo ? 'Elija el tipo de proyecto.' : (d.lat == null && !d.ref) ? 'Marque el punto en el mapa o escriba la dirección.' : !(Number(d.vol) > 0) ? 'Escriba el volumen total.' : !d.plazo ? 'Elija la duración.' : (d.estado === 'Competencia' && !d.comp) ? 'Indique el competidor.' : '';
    if (falta) { err.textContent = falta; return; }
    b.disabled = true; b.textContent = 'Guardando…';
    try {
      const r = await CTX.api('proyectos.guardar', { id: d.id, cliente: d.cliente, proyecto: d.proyecto, tipo: d.tipo, ref: d.ref, lat: d.lat, lng: d.lng, vol: Number(d.vol), mes: d.mes, plazo: Number(d.plazo), estado: d.estado, comp: d.comp, notas: d.notas, asesor: D.gestiona ? d.asesor : undefined });
      const nuevo = !FP.p;
      D = r.datos; MIS.cargado = Date.now();
      cerrarFormulario(); avisarCambio();
      aviso(nuevo ? 'Proyecto registrado (' + r.id + ').' : 'Proyecto actualizado.');
    } catch (e) { b.disabled = false; b.textContent = FP.p ? 'Guardar cambios' : 'Registrar proyecto'; err.textContent = e.message || 'No se pudo guardar.'; }
  }
}

/* ---------- deep links ---------- */
function atenderParams(params) {
  // Solo si el pedido está en la dirección actual (el cascarón conserva los params de la última navegación).
  if (!params || !D || !/[?&](editar|nuevo)=/.test(location.hash)) return;
  if (params.editar) {
    const p = D.proyectos.find(x => x.id === params.editar);
    if (p) { MIS.estado = 'todos'; pintar(); abrirFormulario(p); } else aviso('No se encontró el proyecto ' + params.editar + '.', 'error');
  } else if (params.nuevo) abrirFormulario(null);
  // Se quita el parámetro de la dirección para que al volver al módulo no se abra otra vez.
  if (params.editar || params.nuevo) history.replaceState(null, '', '#proyectos');
}

/* ---------- registro en el cascarón ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden && vivo() && MIS.visible && (!FP.el || FP.el.hidden)) refrescar(); });
MV.registrar('proyectos', {
  relleno: false,
  async montar(el, ctx) {
    CTX = ctx; RAIZ = el; D = null;
    Object.assign(MIS, { estado: 'perspectiva', q: '', asesor: null, max: 60, visible: true, sucio: false });
    if (FP.el) cerrarFormulario();
    el.innerHTML = '<div class="proy-raiz"><div class="proy-cargando"><span class="mv-giro"></span> Cargando proyectos…</div></div>';
    D = await ctx.api('proyectos.cargar'); MIS.cargado = Date.now();
    if (!vivo()) return;
    eventosLista();
    pintar();
    atenderParams(ctx.params);
  },
  async mostrar(ctx) {
    CTX = ctx; MIS.visible = true;
    if ((MIS.sucio || Date.now() - MIS.cargado > 120000) && (!FP.el || FP.el.hidden)) { MIS.sucio = false; await refrescar(); }
    atenderParams(ctx.params);
  },
  ocultar() { MIS.visible = false; if (FP.el && !FP.el.hidden) cerrarFormulario(); }
});
})();
