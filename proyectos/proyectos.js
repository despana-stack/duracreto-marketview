/* Duracreto MarketView — módulo «Proyectos» / «Mis proyectos» (chat Mapa de mercado). v2 con líneas de producto.
 *
 * Datos: ctx.api('proyectos.cargar') → apps-script/Proyectos.gs. El servidor decide qué se ve:
 *   editor y visualizador reciben todos los proyectos; el asesor, solo los suyos; el rol area no tiene acceso.
 *   Escriben (guardar, estado) solo el editor, o el asesor en lo suyo. El visualizador nunca.
 * Pantalla: listado (filtros, tarjetas de totales, tabla ordenable, totales por mes, CSV) y formulario con líneas de producto
 *   (concreto, bloques, agregados, prefabricados) y su reparto por mes.
 * Reparto (mismas curvas que proyPesos_ en Proyectos.gs): editar un mes lo fija y reparte la diferencia entre los meses
 *   siguientes no fijados (si no hay, entre los demás libres), proporcional a la curva; nunca se tocan los meses anteriores
 *   al mes actual; todo en enteros y el último mes libre absorbe el redondeo.
 * Deep links: #proyectos?editar=PRY-0123 (lo usa «Actualizar» del mapa) · #proyectos?nuevo=1.
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
  { k: 'perspectiva', n: 'Perspectiva' }, { k: 'ganado', n: 'Ganado' },
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
/* Negocios de las líneas (glifos y colores iguales a los del mapa). */
const GLIFO = {
  concreto: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16V8h9v8"/><path d="M11 10h4l3 3v3h-7"/><path d="M4.5 8l3-3 4 1"/><circle cx="6" cy="17.5" r="1.8" fill="#fff"/><circle cx="15.5" cy="17.5" r="1.8" fill="#fff"/></svg>',
  agregados: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M2 19l6.5-10 3.5 5 2.5-3.5L22 19z"/></svg>',
  bloques: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 12h18M9 5v7M15 12v7"/></svg>',
  prefabricados: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M5 5h14M5 19h14M12 5v14"/></svg>'
};
const NEG = {
  concreto: { n: 'Concreto', u: 'm³', color: '#1D5FA8', cats: [] },
  bloques: { n: 'Bloques', u: 'u', color: '#C2410C', cats: ['Bloques', 'Adoquines'] },
  agregados: { n: 'Agregados', u: 'm³', color: '#8A6D1F', cats: ['Arena', 'Grava'] },
  prefabricados: { n: 'Prefabricados', u: 'u', color: '#0F766E', cats: null }
};
const NEGS = ['concreto', 'bloques', 'agregados', 'prefabricados'];
const ORDEN_AGREGAR = ['bloques', 'agregados', 'prefabricados', 'concreto'];
const IC_BUSCAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const IC_DESCARGA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>';
const IC_FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

/* ---------- utilidades ---------- */
const $ = id => document.getElementById('proy-' + id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const NF = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });
const fmt = n => NF.format(Math.round(Number(n) || 0));
const fmtMes = m => { const x = String(m || '').match(/^(\d{4})-(\d{2})/); return x ? MESES[Number(x[2]) - 1] + ' ' + x[1] : String(m || ''); };
const fmtMesCorto = m => { const x = String(m || '').match(/^(\d{4})-(\d{2})/); return x ? MESES[Number(x[2]) - 1] + ' ' + x[1].slice(2) : ''; };
const sumarMes = (k, n) => { let y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7)) + n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); };
const mesesDe = (mes, plazo) => { const out = []; for (let i = 0; i < plazo; i++) out.push(sumarMes(mes, i)); return out; };
const estadoK = e => { const n = norm(e); if (n === 'ganado') return 'ganado'; if (n === 'perspectiva') return 'perspectiva'; if (n.indexOf('competencia') === 0) return 'competencia'; if (n === 'perdido') return 'perdido'; return 'sinestado'; };
const estadoN = k => (ESTADOS.find(e => e.k === k) || ESTADOS[4]).n;
const esAprox = p => /^s[ií]/i.test(String(p.aprox || ''));
const activo = a => /^s[ií]/i.test(String(a.activo || ''));
const segK = p => { const n = norm(p.segmento) + ' ' + norm(p.tipo); if (/vertical|torre|edificio|apartament/.test(n)) return 'vertical'; if (/horizontal|residencial|urbaniz|casa|vivienda|condomin/.test(n)) return 'casa'; if (/industrial|bodega|nave|planta/.test(n)) return 'industria'; if (/vial|infraestructura|pavimen|puente|carretera|desnivel/.test(n)) return 'vial'; return 'otro'; };
const icoSeg = (sk, t) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" aria-hidden="true">${SEG_ICO[sk]}</svg>`;
const icoNeg = (neg, t) => `<span class="proy-neg" style="--w:${t}px" title="${esc((NEG[neg] || NEG.concreto).n)}">${(GLIFO[neg] || GLIFO.concreto).replace(/#fff/g, (NEG[neg] || NEG.concreto).color)}</span>`;
/* Ícono del proyecto: tipo suelto + punto de estado (hueco = ubicación aproximada), igual que en el mapa. */
const pinSvg = (ek, sk, aprox, w) => `<span class="mk-s${aprox ? ' ax' : ''}" style="--w:${w}px;--c:var(--proy-${ek})">${icoSeg(sk, w)}<i></i></span>`;
const mesHoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
function aviso(m, tipo) { if (CTX) CTX.aviso(m, tipo); }

/* ---------- reparto (mismas curvas que proyPesos_ en apps-script/Proyectos.gs) ---------- */
function pesos(tipo, n) {
  const w = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? .5 : i / (n - 1), c = Math.sin(Math.PI * (i + .5) / n);
    w.push(tipo === 'vertical' ? (i === 0 ? 1.8 : (i < Math.ceil(n * .2) ? 1.3 : 1 - .35 * x)) : tipo === 'casa' ? .6 + c : tipo === 'industria' ? .6 + .9 * x : tipo === 'vial' ? .25 + c : 1);
  }
  return w;
}
/** Reparte un total entero entre unos meses según sus pesos: redondeo acumulado, el último absorbe el redondeo. */
function repartir(total, ks, ws) {
  const out = {}, t = ws.reduce((a, b) => a + b, 0) || 1;
  let acum = 0, antes = 0;
  ks.forEach((k, i) => { acum += ws[i]; const hasta = i === ks.length - 1 ? total : Math.round(total * acum / t); out[k] = hasta - antes; antes = hasta; });
  return out;
}
const R = {
  hoy: mesHoy(),
  meses: l => mesesDe(l.mes, l.plazo),
  peso: l => { const ks = R.meses(l), w = pesos(FP.d ? FP.d.tipo : 'otro', ks.length), o = {}; ks.forEach((k, i) => { o[k] = w[i]; }); return o; },
  suma: l => R.meses(l).reduce((a, k) => a + (l.m[k] || 0), 0),
  libre: (l, k) => k >= R.hoy && !l.fij.has(k),
  /** Toda la curva de nuevo (al crear la línea o al cambiar inicio/duración): borra los fijados. */
  todo(l) { l.fij.clear(); const ks = R.meses(l), w = R.peso(l); l.m = (Number(l.total) > 0) ? repartir(Number(l.total), ks, ks.map(k => w[k])) : {}; },
  /** Reparte lo que falta para el total entre «destinos», proporcional a la curva. Devuelve '' o el problema. */
  reparte(l, destinos) {
    const ks = R.meses(l), w = R.peso(l), total = Number(l.total) || 0;
    const resto = total - ks.filter(k => destinos.indexOf(k) < 0).reduce((a, k) => a + (l.m[k] || 0), 0);
    if (!destinos.length) return resto === 0 ? '' : 'sinlibres';
    if (resto < 0) return 'excede';
    Object.assign(l.m, repartir(resto, destinos, destinos.map(k => w[k])));
    return '';
  },
  /** Editar un mes: lo fija y reparte la diferencia entre los siguientes libres (o entre los demás libres). */
  editar(l, k, v) {
    if (k < R.hoy) return '';
    const ks = R.meses(l);
    let dest = ks.filter(x => x > k && R.libre(l, x));
    if (!dest.length) dest = ks.filter(x => x !== k && R.libre(l, x));
    const fijo = ks.filter(x => x !== k && dest.indexOf(x) < 0).reduce((a, x) => a + (l.m[x] || 0), 0);
    const max = Math.max(0, (Number(l.total) || 0) - fijo);
    let msg = '';
    v = Math.max(0, Math.round(Number(v) || 0));
    if (v > max) { msg = 'En ' + fmtMes(k) + ' solo caben ' + fmt(max) + ' ' + NEG[l.neg].u + ' (el resto ya está en otros meses).'; v = max; }
    l.m[k] = v; l.fij.add(k);
    R.reparte(l, dest);
    return msg;
  },
  /** Cambiar el total respeta los fijados y los meses pasados; reparte en los libres. */
  total(l) {
    const ks = R.meses(l);
    if (!ks.some(k => l.m[k])) { const f = new Set(l.fij); R.todo(l); f.forEach(k => l.fij.add(k)); return; }
    R.reparte(l, ks.filter(k => R.libre(l, k)));
  },
  /** Restablecer: quita los fijados y vuelve a la curva, sin tocar los meses ya pasados. */
  restablecer(l) {
    l.fij.clear();
    const ks = R.meses(l);
    if (!ks.some(k => k < R.hoy)) { R.todo(l); return; }
    R.reparte(l, ks.filter(k => k >= R.hoy));
  },
  estado(l) {
    const s = R.suma(l), t = Number(l.total) || 0, libres = R.meses(l).filter(k => R.libre(l, k)).length;
    return { suma: s, total: t, ok: t > 0 && s === t, libres };
  },
  /* ---- Líneas que no cuadran (proyectos existentes: total ≠ suma de los meses) ---- */
  /** Opción 1: el total pasa a ser la suma de los meses. */
  usarSuma(l) { l.total = R.suma(l); },
  /** Plan de la opción 2: en qué meses que vienen se reparte y si hay que alargar la duración. */
  planFalta(l) {
    const fin = R.meses(l).slice(-1)[0], hasta = [fin, sumarMes(R.hoy, 2)].sort()[1];
    const libresYa = R.meses(l).filter(k => R.libre(l, k));
    if (libresYa.length) return { plazo: Number(l.plazo), hasta: '' };
    let plazo = Number(l.plazo); while (mesesDe(l.mes, plazo).slice(-1)[0] < hasta) plazo++;
    return { plazo, hasta: plazo !== Number(l.plazo) ? hasta : '' };
  },
  /** Opción 2: suma lo que falta a los meses que vienen (libres), según la curva; alarga la duración si hace falta. */
  repartirFalta(l) {
    const falta = (Number(l.total) || 0) - R.suma(l); if (falta <= 0) return;
    l.plazo = R.planFalta(l).plazo;
    const ks = R.meses(l);
    let dest = ks.filter(k => R.libre(l, k));
    if (!dest.length) { dest = ks.filter(k => k >= R.hoy); dest.forEach(k => l.fij.delete(k)); }   // todos fijados: se liberan los que vienen
    const w = R.peso(l), extra = repartir(falta, dest, dest.map(k => w[k]));
    dest.forEach(k => { l.m[k] = (l.m[k] || 0) + extra[k]; });
  }
};

/* ---------- estado del módulo ---------- */
let CTX = null, RAIZ = null, D = null, refrescando = null;
const V = { visible: true, sucio: false, cargado: 0, abierto: '', tm: false, orden: { col: 'rango', dir: -1 } };
const F = { q: '', asesor: '', zona: '', seg: '', prod: '', estados: new Set(), desde: '', hasta: '' };
const FP = { p: null, d: null, map: null, marca: null, lugares: [], el: null, scrim: null, dlg: null };
const vivo = () => !!(RAIZ && RAIZ.isConnected);
const miNombre = () => (D && (D.miNombre || D.miAsesor)) || (CTX && CTX.usuario.nombre) || '';
/* Quién puede cambiar: el editor todo; el asesor lo suyo (el servidor ya le manda solo lo suyo). El visualizador nunca. */
const puedeEditar = () => !!(D && D.registrar && (D.editaTodo || D.esAsesor));
const verMapa = () => !!(CTX && CTX.usuario.roles && CTX.usuario.roles.mapa);
const catalogo = () => (D && D.catalogo) || [];
const prodNombre = id => { const p = catalogo().find(x => x.id === id); return p ? p.nombre + (p.esp ? ' (' + p.esp + ')' : '') : ''; };

async function refrescar() {
  if (!vivo() || refrescando) return refrescando || undefined;
  refrescando = (async () => { try { aplicar(await CTX.api('proyectos.cargar')); } catch (e) { console.error(e); } finally { refrescando = null; } })();
  return refrescando;
}
function aplicar(d) {
  if (!d) return;
  D = d; V.cargado = Date.now();
  if (d.mesActual) R.hoy = d.mesActual;
  if (!F.desde) { F.desde = R.hoy; F.hasta = sumarMes(R.hoy, 5); }
  if (vivo() && (!FP.el || FP.el.hidden)) pintar();
}
/* Avisa al mapa que la base cambió, para que se actualice al volver. */
function avisarCambio() { window.dispatchEvent(new CustomEvent('mv-mapa:cambio', { detail: { origen: 'proyectos' } })); }
window.addEventListener('mv-mapa:cambio', e => {
  if (!vivo() || (e.detail && e.detail.origen === 'proyectos')) return;
  V.sucio = true;
  if (V.visible && !document.hidden) { V.sucio = false; refrescar(); }
});

/* ---------- filtros y cálculos del listado ---------- */
/** ¿La línea entra en el filtro de producto? 'neg:bloques' · 'cat:agregados:Arena' · 'prod:tub-24' */
function lineaEnFiltro(l) {
  if (!F.prod) return true;
  const [t, a, b] = F.prod.split(':');
  if (t === 'neg') return l.neg === a;
  if (t === 'cat') return l.neg === a && l.cat === b;
  if (t === 'prod') return l.prod === a;
  return true;
}
function enRango(l) {
  let s = 0;
  Object.keys(l.m || {}).forEach(k => { if (k >= F.desde && k <= F.hasta) s += Number(l.m[k]) || 0; });
  return s;
}
/** Proyectos que pasan los filtros (sin contar el rango), con sus cantidades en el rango por negocio. */
function filas() {
  const q = norm(F.q);
  return D.proyectos.filter(p => {
    if (F.asesor === '__sin') { if (p.asesor) return false; } else if (F.asesor && norm(p.asesor) !== norm(F.asesor)) return false;
    if (F.zona && p.zona !== F.zona) return false;
    if (F.seg && segK(p) !== F.seg) return false;
    if (F.estados.size && !F.estados.has(estadoK(p.estado))) return false;
    if (F.prod && !(p.lineas || []).some(lineaEnFiltro)) return false;
    if (q && norm([p.cliente, p.proyecto, p.id, p.asesor].join(' ')).indexOf(q) < 0) return false;
    return true;
  }).map(p => {
    const r = { concreto: 0, bloques: 0, agregados: 0, prefabricados: 0 };
    (p.lineas || []).filter(lineaEnFiltro).forEach(l => { r[l.neg] = (r[l.neg] || 0) + enRango(l); });
    const llave = r.concreto * 1e6 + r.agregados * 1e3 + (r.bloques + r.prefabricados) / 1e3;
    return { p, r, llave, hay: NEGS.some(n => r[n] > 0) };
  });
}
function textoRango(r) {
  const t = NEGS.filter(n => r[n] > 0).map(n => `<span class="rg">${icoNeg(n, 14)}${fmt(r[n])} ${NEG[n].u}</span>`).join('');
  return t || '<span class="nota">—</span>';
}
function ordenar(rows) {
  const { col, dir } = V.orden, ek = r => ESTADOS.findIndex(e => e.k === estadoK(r.p.estado));
  const val = {
    cliente: r => norm((r.p.cliente || '') + ' ' + (r.p.proyecto || '')), asesor: r => norm(r.p.asesor), zona: r => norm(r.p.zona),
    estado: ek, productos: r => (r.p.lineas || []).length, rango: r => r.llave, inicio: r => String(r.p.mes || '9999'), act: r => String(r.p.act || '')
  }[col] || (r => r.llave);
  return rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || norm(a.p.proyecto).localeCompare(norm(b.p.proyecto)); });
}
/** Opciones del filtro de producto: negocios, sus categorías y los prefabricados que aparecen en los proyectos. */
function opcionesProducto() {
  const usados = {}, prods = {};
  D.proyectos.forEach(p => (p.lineas || []).forEach(l => { usados[l.neg + ':' + (l.cat || '')] = true; if (l.prod) prods[l.prod] = l.cat || prodNombre(l.prod) || l.prod; }));
  let h = '<option value="">Todos los productos</option>';
  NEGS.forEach(n => {
    h += `<optgroup label="${NEG[n].n}"><option value="neg:${n}"${F.prod === 'neg:' + n ? ' selected' : ''}>${NEG[n].n} (todo)</option>`;
    (NEG[n].cats || []).forEach(c => { if (usados[n + ':' + c]) h += `<option value="cat:${n}:${esc(c)}"${F.prod === 'cat:' + n + ':' + c ? ' selected' : ''}>${esc(c)}</option>`; });
    if (n === 'prefabricados') Object.keys(prods).sort((a, b) => prods[a].localeCompare(prods[b], 'es')).forEach(id => { h += `<option value="prod:${esc(id)}"${F.prod === 'prod:' + id ? ' selected' : ''}>${esc(prods[id])}</option>`; });
    h += '</optgroup>';
  });
  return h;
}
function opcionesMes(sel, desde, hasta) {
  let h = '', k = desde;
  while (k <= hasta) { h += `<option value="${k}"${k === sel ? ' selected' : ''}>${fmtMes(k)}</option>`; k = sumarMes(k, 1); }
  return h;
}
function nFiltros() { return [F.q, F.asesor, F.zona, F.seg, F.prod, F.estados.size].filter(Boolean).length; }

/* ---------- listado ---------- */
function pintar() {
  if (!vivo() || !D) return;
  const rows = filas(), conRango = rows.filter(r => r.hay);
  const tot = { concreto: 0, bloques: 0, agregados: 0, prefabricados: 0 };
  rows.forEach(r => NEGS.forEach(n => { tot[n] += r.r[n]; }));
  ordenar(rows);
  const zonas = [...new Set(D.proyectos.map(p => p.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const asesores = [...new Set(D.asesores.filter(activo).map(a => a.nombre).concat(D.proyectos.map(p => p.asesor).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'es'));
  const rangoTxt = F.desde === F.hasta ? fmtMes(F.desde) : fmtMes(F.desde) + ' a ' + fmtMes(F.hasta);
  const cnt = {}; filasSinEstado().forEach(p => { const k = estadoK(p.estado); cnt[k] = (cnt[k] || 0) + 1; });
  const titulo = D.esAsesor ? 'Mis proyectos' : 'Proyectos';
  const tenia = document.activeElement && document.activeElement.id === 'proy-q';
  const th = (c, t, cls) => `<th class="${cls || ''}" data-orden="${c}" aria-sort="${V.orden.col === c ? (V.orden.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button type="button">${t}${V.orden.col === c ? (V.orden.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
  RAIZ.innerHTML = `<div class="proy-raiz"><div class="pagina-in">
    <div class="pag-h"><div><h1>${titulo}</h1><p>${D.esAsesor ? 'Registre sus proyectos y lo que van a necesitar mes a mes.' : D.editaTodo ? 'Proyectos de todo el equipo. Puede registrar y cambiar cualquiera.' : 'Proyectos de todo el equipo (solo consulta).'}</p></div>
      ${puedeEditar() ? `<button type="button" class="mv-btn primario" data-accion="nuevo">+ Registrar proyecto</button>` : ''}</div>

    <section class="filtros mv-card${V.verFiltros ? ' abiertos' : ''}">
      <div class="f-top"><div class="buscar">${IC_BUSCAR}<input type="search" id="proy-q" class="mv-input" placeholder="Buscar cliente, proyecto o asesor" value="${esc(F.q)}" autocomplete="off"></div><button type="button" class="mv-btn ver-filtros" data-accion="ver-filtros" aria-expanded="${!!V.verFiltros}">Filtros${nFiltros() ? ` <em>${nFiltros()}</em>` : ''}</button></div>
      <div class="fgrid">
        ${D.esAsesor ? '' : `<label class="fld"><span>Asesor</span><select class="mv-input" data-f="asesor"><option value="">Todos</option>${asesores.map(a => `<option${norm(a) === norm(F.asesor) ? ' selected' : ''}>${esc(a)}</option>`).join('')}<option value="__sin"${F.asesor === '__sin' ? ' selected' : ''}>Sin asesor</option></select></label>`}
        <label class="fld"><span>Zona</span><select class="mv-input" data-f="zona"><option value="">Todas</option>${zonas.map(z => `<option${z === F.zona ? ' selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
        <label class="fld"><span>Segmento</span><select class="mv-input" data-f="seg"><option value="">Todos</option>${TIPOS.map(t => `<option value="${t}"${t === F.seg ? ' selected' : ''}>${SEG_CORTO[t]}</option>`).join('')}</select></label>
        <label class="fld"><span>Producto</span><select class="mv-input" data-f="prod">${opcionesProducto()}</select></label>
        <label class="fld"><span>Desde</span><select class="mv-input" data-f="desde">${opcionesMes(F.desde, sumarMes(R.hoy, -24), sumarMes(R.hoy, 36))}</select></label>
        <label class="fld"><span>Hasta</span><select class="mv-input" data-f="hasta">${opcionesMes(F.hasta, F.desde, sumarMes(R.hoy, 36))}</select></label>
      </div>
      <div class="grupo"><div class="sub-h"><span class="sub">Estado</span>${F.estados.size ? '<button type="button" class="todos" data-todos="1">Todos</button>' : ''}</div>
        <div class="pills${F.estados.size ? ' filtrado' : ''}" role="group" aria-label="Estado">${ESTADOS.filter(e => cnt[e.k] || F.estados.has(e.k)).map(e => `<button type="button" class="pill" data-est="${e.k}" aria-pressed="${F.estados.has(e.k)}"><i class="e-${e.k}"></i>${e.n}<small>${cnt[e.k] || 0}</small></button>`).join('')}</div></div>
      ${nFiltros() ? '<button type="button" class="limpiar" data-accion="limpiar">Quitar filtros</button>' : ''}
    </section>

    <section class="kpis" aria-label="Totales de ${esc(rangoTxt)}">
      <div class="kpi"><small>Proyectos con movimiento</small><b>${fmt(conRango.length)}</b><span>de ${fmt(rows.length)} filtrados</span></div>
      ${NEGS.map(n => `<div class="kpi"><small>${icoNeg(n, 16)}${NEG[n].n}</small><b>${fmt(tot[n])}</b><span>${NEG[n].u === 'u' ? 'unidades' : 'm³'}</span></div>`).join('')}
      <p class="kpi-nota">${esc(rangoTxt)} · según los filtros</p>
    </section>

    <div class="acc-lista">
      <button type="button" class="mv-btn" data-accion="csv-proyectos">${IC_DESCARGA}Proyectos (CSV)</button>
      <button type="button" class="mv-btn" data-accion="csv-lineas">${IC_DESCARGA}Líneas (CSV)</button>
    </div>

    <div class="tabla-w">
      <table class="tabla">
        <thead><tr>${th('cliente', 'Cliente / Proyecto')}${D.esAsesor ? '' : th('asesor', 'Asesor')}${th('zona', 'Zona')}${th('estado', 'Estado')}${th('productos', 'Productos')}${th('rango', 'En el rango', 'num')}${th('inicio', 'Inicio')}${th('act', 'Actualizado')}</tr></thead>
        <tbody>${rows.length ? rows.slice(0, V.max || 150).map(fila).join('') : `<tr><td colspan="8" class="vacio">${D.proyectos.length ? 'Ningún proyecto con estos filtros.' : 'Aún no hay proyectos registrados.'}</td></tr>`}</tbody>
      </table>
    </div>
    ${rows.length > (V.max || 150) ? `<button type="button" class="mv-btn" data-accion="mas">Ver ${Math.min(150, rows.length - (V.max || 150))} más (de ${rows.length})</button>` : ''}

    <section class="tm">
      <button type="button" class="tm-h" data-accion="tm" aria-expanded="${V.tm}">Totales por mes ${IC_FLECHA}</button>
      ${V.tm ? totalesPorMes(rows) : ''}
    </section>
    <p class="leido">Datos de la base al ${esc(D.leido || '')}</p>
  </div></div>`;
  if (tenia) { const i = $('q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
/** Proyectos que pasan los demás filtros (para contar por estado sin el propio filtro de estado). */
function filasSinEstado() { const e = F.estados; F.estados = new Set(); const r = filas().map(x => x.p); F.estados = e; return r; }
function fila(r) {
  const p = r.p, ek = estadoK(p.estado), abierto = V.abierto === p.id;
  const negs = [...new Set((p.lineas || []).map(l => l.neg))];
  return `<tr class="fila${abierto ? ' abierta' : ''}" data-abrir="${esc(p.id)}" tabindex="0">
      <td class="c-cli" data-l="Proyecto"><div class="cc">${pinSvg(ek, segK(p), esAprox(p), 24)}<div><b>${esc(p.proyecto || 'Sin nombre')}</b><small>${esc(p.cliente || '')} · ${esc(p.id)}</small></div></div></td>
      ${D.esAsesor ? '' : `<td data-l="Asesor">${esc(p.asesor || '—')}</td>`}
      <td data-l="Zona">${esc(p.zona || '—')}</td>
      <td data-l="Estado"><span class="chip"><i class="e-${ek}"></i>${estadoN(ek)}</span></td>
      <td data-l="Productos" class="c-prod">${negs.map(n => icoNeg(n, 18)).join('')}</td>
      <td data-l="En el rango" class="num c-rango">${textoRango(r.r)}</td>
      <td data-l="Inicio">${esc(fmtMes(p.mes))}</td>
      <td data-l="Actualizado">${esc(p.act || '—')}</td>
    </tr>${abierto ? `<tr class="detalle"><td colspan="8">${detalle(p)}</td></tr>` : ''}`;
}
function detalle(p) {
  const ek = estadoK(p.estado), ed = puedeEditar();
  const lineas = (p.lineas || []).map(l => {
    const ks = mesesDe(l.mes, l.plazo), max = Math.max(1, ...ks.map(k => Number(l.m[k]) || 0));
    return `<div class="dl">
      <div class="dl-h">${icoNeg(l.neg, 18)}<b>${NEG[l.neg].n}${l.cat ? ' · ' + esc(l.cat) : ''}</b><span>${fmt(l.total)} ${NEG[l.neg].u} · ${fmtMes(l.mes)} · ${l.plazo} ${l.plazo === 1 ? 'mes' : 'meses'}</span></div>
      <div class="barras">${ks.map(k => `<div class="b${k >= F.desde && k <= F.hasta ? ' en' : ''}" title="${fmtMes(k)}: ${fmt(l.m[k] || 0)} ${NEG[l.neg].u}"><i style="height:${Math.max(2, (Number(l.m[k]) || 0) / max * 100)}%"></i><span>${fmtMesCorto(k)}</span></div>`).join('')}</div>
    </div>`;
  }).join('');
  return `<div class="det">
    <div class="det-datos">${[p.segmento, p.planta ? 'Planta ' + String(p.planta).replace(/^Duracreto\s*-\s*Planta\s*/i, '') : '', p.comp ? 'Competencia: ' + p.comp : '', p.notas].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')}</div>
    ${lineas}
    ${(p.lineas || []).some(l => l.desdeFila) ? '<p class="nota">Datos tomados de la fila del proyecto (aún sin líneas guardadas).</p>' : ''}
    <div class="acc">
      ${ed ? `<div class="estsel" role="group" aria-label="Estado">${['perspectiva', 'ganado', 'competencia', 'perdido'].map(k => `<button type="button" data-est-p="${esc(p.id)}" data-est-v="${k}" aria-pressed="${ek === k}"><i class="e-${k}"></i>${estadoN(k)}</button>`).join('')}</div>` : ''}
      <span style="flex:1"></span>
      ${p.lat != null && verMapa() ? `<button type="button" class="mv-btn" data-ver="${esc(p.id)}">Ver en mapa</button>` : ''}
      ${ed ? `<button type="button" class="mv-btn primario" data-editar="${esc(p.id)}">Editar</button>` : ''}
    </div></div>`;
}
function totalesPorMes(rows) {
  const ks = []; let k = F.desde; while (k <= F.hasta && ks.length < 48) { ks.push(k); k = sumarMes(k, 1); }
  const t = {}; NEGS.forEach(n => { t[n] = {}; });
  rows.forEach(r => (r.p.lineas || []).filter(lineaEnFiltro).forEach(l => ks.forEach(m => { t[l.neg][m] = (t[l.neg][m] || 0) + (Number(l.m[m]) || 0); })));
  const negs = NEGS.filter(n => ks.some(m => t[n][m]));
  if (!negs.length) return '<p class="nota" style="padding:8px 0">No hay cantidades en el rango con estos filtros.</p>';
  return `<div class="tm-w"><table class="tm-t"><thead><tr><th>Negocio</th>${ks.map(m => `<th>${fmtMesCorto(m)}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${negs.map(n => `<tr><th>${icoNeg(n, 16)}${NEG[n].n} <small>${NEG[n].u}</small></th>${ks.map(m => `<td>${t[n][m] ? fmt(t[n][m]) : ''}</td>`).join('')}<td><b>${fmt(ks.reduce((a, m) => a + (t[n][m] || 0), 0))}</b></td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- CSV (UTF-8 con BOM para Excel) ---------- */
function csv(nombre, filasCsv) {
  const txt = filasCsv.map(r => r.map(v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvProyectos() {
  const rows = ordenar(filas()), r = [['ID', 'Cliente', 'Proyecto', 'Asesor', 'Zona', 'País', 'Segmento', 'Estado', 'Competidor', 'Negocios', 'Inicio', 'Plazo (meses)',
    'Concreto m³ (rango)', 'Bloques u (rango)', 'Agregados m³ (rango)', 'Prefabricados u (rango)', 'Actualizado']];
  rows.forEach(x => { const p = x.p; r.push([p.id, p.cliente, p.proyecto, p.asesor, p.zona, p.pais, p.segmento, estadoN(estadoK(p.estado)), p.comp, [...new Set((p.lineas || []).map(l => NEG[l.neg].n))].join(' / '), p.mes, p.plazo, x.r.concreto, x.r.bloques, x.r.agregados, x.r.prefabricados, p.act]); });
  csv('proyectos', r);
}
function csvLineas() {
  const ks = []; let k = F.desde; while (k <= F.hasta && ks.length < 48) { ks.push(k); k = sumarMes(k, 1); }
  const r = [['ID línea', 'ID proyecto', 'Cliente', 'Proyecto', 'Asesor', 'Estado', 'Negocio', 'Categoría / producto', 'Unidad', 'Total', 'Inicio', 'Plazo (meses)', 'En el rango'].concat(ks.map(fmtMes))];
  ordenar(filas()).forEach(x => (x.p.lineas || []).filter(lineaEnFiltro).forEach(l => {
    r.push([l.id || '(sin guardar)', x.p.id, x.p.cliente, x.p.proyecto, x.p.asesor, estadoN(estadoK(x.p.estado)), NEG[l.neg].n, l.cat, NEG[l.neg].u, l.total, l.mes, l.plazo, enRango(l)].concat(ks.map(m => l.m[m] || '')));
  }));
  csv('proyectos-lineas', r);
}

/* ---------- eventos del listado ---------- */
function eventosLista() {
  RAIZ.addEventListener('click', async ev => {
    if (!D) return;
    const th = ev.target.closest('th[data-orden]');
    if (th) { const c = th.dataset.orden; V.orden = { col: c, dir: V.orden.col === c ? -V.orden.dir : (c === 'rango' || c === 'act' ? -1 : 1) }; pintar(); return; }
    const b = ev.target.closest('button');
    const p = id => D.proyectos.find(x => x.id === id);
    if (b) {
      const a = b.dataset.accion;
      if (a === 'nuevo') { abrirFormulario(null); return; }
      if (a === 'mas') { V.max = (V.max || 150) + 150; pintar(); return; }
      if (a === 'tm') { V.tm = !V.tm; pintar(); return; }
      if (a === 'ver-filtros') { V.verFiltros = !V.verFiltros; pintar(); return; }
      if (a === 'limpiar') { Object.assign(F, { q: '', asesor: '', zona: '', seg: '', prod: '' }); F.estados.clear(); pintar(); return; }
      if (a === 'csv-proyectos') { csvProyectos(); return; }
      if (a === 'csv-lineas') { csvLineas(); return; }
      if (b.dataset.todos) { F.estados.clear(); pintar(); return; }
      if (b.dataset.est) {
        // Misma regla que el mapa: primer toque deja solo ese; los siguientes suman; tocar uno seleccionado lo quita;
        // si quedan todos los visibles, vuelve a «todos».
        const k = b.dataset.est, todas = [...b.parentElement.querySelectorAll('[data-est]')].map(x => x.dataset.est);
        if (F.estados.has(k)) F.estados.delete(k); else F.estados.add(k);
        if (todas.every(x => F.estados.has(x))) F.estados.clear();
        pintar(); return;
      }
      if (b.dataset.editar) { abrirFormulario(p(b.dataset.editar)); return; }
      if (b.dataset.ver) { CTX.abrir('mapa', { id: b.dataset.ver }); return; }
      if (b.dataset.estP) {
        const pr = p(b.dataset.estP), k = b.dataset.estV; if (!pr || estadoK(pr.estado) === k) return;
        let comp = '';
        if (k === 'competencia') { comp = await pedirCompetidor(pr.comp); if (comp === null) return; }
        b.disabled = true;
        try { const r = await CTX.api('proyectos.estado', { id: pr.id, estado: estadoN(k), comp }); aplicar(r.datos); avisarCambio(); aviso(`${pr.proyecto || pr.id}: ${estadoN(k)}.`); }
        catch (e) { b.disabled = false; aviso(e.message || 'No se pudo guardar.', 'error'); }
        return;
      }
      return;
    }
    const tr = ev.target.closest('tr[data-abrir]');
    if (tr) { V.abierto = V.abierto === tr.dataset.abrir ? '' : tr.dataset.abrir; pintar(); }
  });
  RAIZ.addEventListener('keydown', ev => {
    const tr = ev.target.closest && ev.target.closest('tr[data-abrir]');
    if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); V.abierto = V.abierto === tr.dataset.abrir ? '' : tr.dataset.abrir; pintar(); }
  });
  RAIZ.addEventListener('change', ev => {
    const f = ev.target.dataset.f; if (!f) return;
    F[f] = ev.target.value;
    if (f === 'desde' && F.hasta < F.desde) F.hasta = F.desde;
    V.max = 150; pintar();
  });
  let tq;
  RAIZ.addEventListener('input', ev => { if (ev.target.id === 'proy-q') { const v = ev.target.value; clearTimeout(tq); tq = setTimeout(() => { F.q = v; pintar(); }, 250); } });
}

/* ---------- capas flotantes (formulario y diálogo) ---------- */
function flotantes() {
  if (FP.el && FP.el.isConnected) return;
  FP.scrim = document.createElement('div'); FP.scrim.className = 'proy-flotante proy-scrim'; FP.scrim.hidden = true;
  FP.el = document.createElement('aside'); FP.el.className = 'proy-flotante proy-drawer'; FP.el.hidden = true; FP.el.setAttribute('aria-label', 'Formulario de proyecto');
  FP.dlg = document.createElement('div'); FP.dlg.className = 'proy-flotante proy-dlg'; FP.dlg.hidden = true;
  document.body.append(FP.scrim, FP.el, FP.dlg);
  FP.scrim.addEventListener('click', () => cerrarFormulario());
  FP.el.addEventListener('click', clicFormulario);
  FP.el.addEventListener('change', cambioFormulario);
}
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || !FP.el || FP.el.hidden) return;
  if (FP.dlg && !FP.dlg.hidden) return;
  cerrarFormulario();
});

/* Diálogo para elegir el competidor */
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
/* Confirmación simple (sí / no) */
function confirmar(titulo, texto, si) {
  flotantes();
  return new Promise(res => {
    const dlg = FP.dlg;
    dlg.innerHTML = `<div class="dlg-c" role="alertdialog" aria-modal="true"><h3>${esc(titulo)}</h3><p class="nota">${esc(texto)}</p>
      <div class="fila-b" style="justify-content:flex-end"><button type="button" class="mv-btn" id="proy-cf-no">Cancelar</button><button type="button" class="mv-btn primario" id="proy-cf-si">${esc(si)}</button></div></div>`;
    dlg.hidden = false;
    const fin = v => { dlg.hidden = true; dlg.innerHTML = ''; res(v); };
    $('cf-no').onclick = () => fin(false); $('cf-si').onclick = () => fin(true);
    dlg.onclick = e => { if (e.target === dlg) fin(false); };
    $('cf-si').focus();
  });
}

/* ---------- formulario ---------- */
function nuevaLinea(neg, base) {
  const ref = base || {};
  return { id: '', neg, cat: '', prod: '', total: '', mes: ref.mes || sumarMes(R.hoy, 1), plazo: ref.plazo || 3, m: {}, fij: new Set() };
}
function abrirFormulario(p) {
  if (!puedeEditar()) { aviso('Su usuario puede ver los proyectos, pero no cambiarlos.', 'error'); return; }
  flotantes();
  FP.p = p; FP.lugares = [];
  FP.d = p ? { id: p.id, cliente: p.cliente || '', proyecto: p.proyecto || '', tipo: segK(p), ref: p.ref || '', lat: p.lat, lng: p.lng,
      estado: estadoN(estadoK(p.estado)), comp: p.comp || '', notas: p.notas || '', asesor: p.asesor || '',
      lineas: (p.lineas || []).map(l => ({ id: l.id || '', neg: l.neg, cat: l.cat || '', prod: l.prod || '', total: l.total, mes: l.mes, plazo: l.plazo, m: Object.assign({}, l.m), fij: new Set(l.fij || []) })) }
    : { cliente: '', proyecto: '', tipo: '', ref: '', lat: null, lng: null, estado: 'Perspectiva', comp: '', notas: '', asesor: D.editaTodo ? (D.miAsesor || '') : miNombre(), lineas: [nuevaLinea('concreto')] };
  if (FP.d.estado === 'Sin estado') FP.d.estado = 'Perspectiva';
  if (!FP.d.lineas.length) FP.d.lineas.push(nuevaLinea('concreto'));
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
  const d = FP.d;
  const clientes = [...new Set(D.proyectos.map(p => String(p.cliente || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 800);
  const asesores = [...new Set(D.asesores.filter(activo).map(a => a.nombre))].sort((a, b) => a.localeCompare(b, 'es'));
  const estados = ['Perspectiva', 'Ganado', 'Competencia', 'Perdido'];
  FP.el.innerHTML = `<div class="drawer-h"><h2>${FP.p ? 'Actualizar proyecto' : 'Registrar proyecto'}</h2><button type="button" class="btn ghost" data-fp="cerrar" aria-label="Cerrar">✕</button></div>
    <div class="fp-sec"><span class="lbl"><em>1</em>Proyecto</span>
      <div class="fld"><label for="proy-fp-cliente">Cliente</label><input type="text" class="mv-input" id="proy-fp-cliente" list="proy-fp-clientes" value="${esc(d.cliente)}" placeholder="Empresa o persona" autocomplete="off"><datalist id="proy-fp-clientes">${clientes.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="fld"><label for="proy-fp-proyecto">Nombre del proyecto</label><input type="text" class="mv-input" id="proy-fp-proyecto" value="${esc(d.proyecto)}" placeholder="Ej. Torre Los Álamos, bodega en Choloma"></div>
      <span class="lbl2">Tipo de proyecto</span>
      <div class="tipos">${TIPOS.map(k => `<button type="button" class="tipo" data-fp-tipo="${k}" aria-pressed="${d.tipo === k}">${icoSeg(k, 28)}${SEG_CORTO[k]}</button>`).join('')}</div>
    </div>
    <div class="fp-sec"><span class="lbl"><em>2</em>¿Dónde queda?</span>
      <div class="fila-b"><input type="text" class="mv-input" id="proy-fp-ref" value="${esc(d.ref)}" placeholder="Dirección o referencia (colonia, barrio, ciudad)"><button type="button" class="mv-btn" data-fp="buscar">Buscar</button></div>
      <div id="proy-fp-lugares"></div>
      <div id="proy-fp-mapa"></div>
      <div class="fila-b" style="justify-content:space-between;align-items:center"><span class="nota" id="proy-fp-punto">${d.lat != null ? 'Punto marcado. Puede arrastrarlo para afinarlo.' : 'Toque el mapa para marcar el punto (opcional si escribe la dirección).'}</span><button type="button" class="btn ghost" data-fp="gps">Usar mi ubicación</button></div>
    </div>
    <div class="fp-sec"><span class="lbl"><em>3</em>Estado</span>
      <div class="estados4">${estados.map(e => `<button type="button" data-fp-estado="${e}" aria-pressed="${d.estado === e}"><i class="e-${estadoK(e)}"></i>${e}</button>`).join('')}</div>
      <div class="fld" id="proy-fp-comp-w" ${d.estado === 'Competencia' ? '' : 'hidden'}><label for="proy-fp-comp">¿Con qué competidor?</label><select class="mv-input" id="proy-fp-comp"><option value="">Elija el competidor</option>${(D.competidores || []).map(c => `<option${norm(c) === norm(d.comp) ? ' selected' : ''}>${esc(c)}</option>`).join('')}${d.comp && !(D.competidores || []).some(c => norm(c) === norm(d.comp)) ? `<option selected>${esc(d.comp)}</option>` : ''}<option value="__otro">Otro (escribir)</option></select><input type="text" class="mv-input" id="proy-fp-comp-otro" placeholder="Nombre del competidor" hidden></div>
      ${D.editaTodo ? `<div class="fld"><label for="proy-fp-asesor">Asesor</label><select class="mv-input" id="proy-fp-asesor"><option value="">Sin asesor asignado</option>${asesores.map(a => `<option${norm(a) === norm(d.asesor) ? ' selected' : ''}>${esc(a)}</option>`).join('')}${d.asesor && !asesores.some(a => norm(a) === norm(d.asesor)) ? `<option selected>${esc(d.asesor)}</option>` : ''}</select></div>` : ''}
    </div>
    <div class="fp-sec"><span class="lbl"><em>4</em>Productos</span>
      <div id="proy-lineas"></div>
      <div class="agregar"><span class="nota">+ Agregar producto:</span>${ORDEN_AGREGAR.map(n => `<button type="button" class="pill" data-agregar="${n}">${icoNeg(n, 16)}${NEG[n].n}</button>`).join('')}</div>
    </div>
    <div class="fld"><label for="proy-fp-notas">Notas (opcional)</label><textarea class="mv-input" id="proy-fp-notas" placeholder="Ej. losas y pavimento; decide el ingeniero residente">${esc(d.notas)}</textarea></div>
    ${FP.p && FP.p.hist ? `<details><summary class="nota" style="cursor:pointer">Historial de cambios</summary><p class="nota" style="white-space:pre-line;margin-top:6px">${esc(FP.p.hist)}</p></details>` : ''}
    <span class="err" id="proy-fp-err"></span>
    <div class="fp-pie"><button type="button" class="mv-btn" data-fp="cerrar">Cancelar</button><button type="button" class="mv-btn primario" data-fp="guardar">${FP.p ? 'Guardar cambios' : 'Registrar proyecto'}</button></div>`;
  pintarLineas();
}
function opcionesCatalogo(sel) {
  const fam = {};
  catalogo().forEach(p => { (fam[p.familia] = fam[p.familia] || []).push(p); });
  return `<option value="">Elija el producto</option>` + Object.keys(fam).map(f => `<optgroup label="${esc(f)}">${fam[f].map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.nombre + (p.esp ? ' · ' + p.esp : ''))}</option>`).join('')}</optgroup>`).join('');
}
/* Redibuja las líneas. Si un campo con foco dispara «change» al quitarlo (blur), ese cambio se aplica y se redibuja una vez más al final. */
function pintarLineas() {
  if (FP.pintando) { FP.repintar = true; return; }
  FP.pintando = true;
  try {
    const a = document.activeElement, el = $('lineas');
    if (el && a && el.contains(a)) a.blur();
    pintarLineas_();
  } finally { FP.pintando = false; }
  if (FP.repintar) { FP.repintar = false; pintarLineas(); }
}
function pintarLineas_() {
  const el = $('lineas'); if (!el) return;
  const ls = FP.d.lineas;
  el.innerHTML = ls.map((l, i) => {
    const n = NEG[l.neg], st = R.estado(l), ks = R.meses(l);
    const inicioOps = opcionesMes(l.mes, [sumarMes(R.hoy, -12), l.mes].sort()[0], sumarMes(R.hoy, 36));
    const plazos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 24, 30, 36];
    if (plazos.indexOf(Number(l.plazo)) < 0) plazos.push(Number(l.plazo));
    const dif = st.total - st.suma;
    const msg = !st.total ? 'Escriba el total para repartirlo por mes.' :
      st.ok ? `Suma ${fmt(st.suma)} / ${fmt(st.total)} ✓` :
      `Suma ${fmt(st.suma)} / ${fmt(st.total)} · ${dif > 0 ? 'faltan ' + fmt(dif) : 'sobran ' + fmt(-dif)}`;
    // No cuadra (típico en proyectos que vienen del cuadro): dos salidas en un toque. Si sobra, solo la primera.
    const plan = dif > 0 ? R.planFalta(l) : null;
    const cuadre = st.total && !st.ok ? `<div class="cuadre" role="alert"><p><b>Esta línea no cuadra:</b> los meses suman ${fmt(st.suma)} ${n.u} y el total es ${fmt(st.total)} ${n.u}.</p>
        <div class="cuadre-acc">${st.suma > 0 ? `<button type="button" class="mv-btn" data-cuadre="suma">Usar la suma de los meses como total (${fmt(st.suma)})</button>` : ''}
        ${dif > 0 ? `<button type="button" class="mv-btn primario" data-cuadre="repartir">Repartir lo que falta (${fmt(dif)}) en los meses que vienen</button>` : ''}</div>
        ${plan && plan.hasta ? `<p class="nota">Para repartirlo se alarga la duración hasta ${fmtMes(plan.hasta)} (${plan.plazo} meses).</p>` : ''}</div>` : '';
    return `<div class="linea" data-i="${i}">
      <div class="linea-h">${icoNeg(l.neg, 22)}<b>${n.n}</b><span class="nota">${n.u === 'u' ? 'unidades' : 'm³'}</span><span style="flex:1"></span>
        ${ls.length > 1 ? `<button type="button" class="btn ghost quitar" data-quitar="${i}" aria-label="Quitar ${n.n}">Quitar</button>` : ''}</div>
      ${n.cats && n.cats.length ? `<div class="cats"><span class="nota">Opcional:</span>${n.cats.map(c => `<button type="button" class="pill" data-cat="${esc(c)}" aria-pressed="${l.cat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${n.cats === null ? `<div class="fld"><label>Producto</label><select class="mv-input" data-l="prod">${opcionesCatalogo(l.prod)}</select></div>` : ''}
      <div class="grid3">
        <div class="fld"><label>Total (${n.u})</label><input type="number" class="mv-input" data-l="total" min="1" step="1" inputmode="numeric" value="${esc(l.total)}"></div>
        <div class="fld"><label>Inicio</label><select class="mv-input" data-l="mes">${inicioOps}</select></div>
        <div class="fld"><label>Duración</label><select class="mv-input" data-l="plazo">${plazos.sort((a, b) => a - b).map(x => `<option value="${x}"${Number(l.plazo) === x ? ' selected' : ''}>${x} ${x === 1 ? 'mes' : 'meses'}</option>`).join('')}</select></div>
      </div>
      <div class="tira" role="group" aria-label="Reparto por mes">${ks.map(k => {
        const pas = k < R.hoy, fijo = l.fij.has(k);
        return `<div class="mesc${fijo ? ' fijo' : ''}${pas ? ' pasado' : ''}"><span>${fmtMesCorto(k)}${fijo ? `<button type="button" class="candado" data-soltar="${k}" title="Mes fijado: toque para liberarlo" aria-label="Liberar ${fmtMes(k)}">🔒</button>` : ''}</span>
          <input type="number" min="0" step="1" inputmode="numeric" data-mes="${k}" value="${l.m[k] || 0}"${pas ? ' disabled title="Mes pasado: no se cambia"' : ''} aria-label="${fmtMes(k)}"></div>`;
      }).join('')}</div>
      <div class="suma${st.ok ? ' ok' : st.total ? ' mal' : ''}"><span>${msg}</span><button type="button" class="btn ghost" data-restablecer="${i}">Restablecer</button></div>
      ${cuadre}
    </div>`;
  }).join('');
}
function leerForm() {
  const d = FP.d, v = id => { const e = $(id); return e ? e.value : ''; };
  d.cliente = v('fp-cliente').trim(); d.proyecto = v('fp-proyecto').trim(); d.ref = v('fp-ref').trim(); d.notas = v('fp-notas').trim();
  if ($('fp-asesor')) d.asesor = v('fp-asesor');
  const sel = v('fp-comp'); d.comp = sel === '__otro' ? v('fp-comp-otro').trim() : sel;
  return d;
}
async function cambioFormulario(ev) {
  const t = ev.target;
  if (t.id === 'proy-fp-comp') { $('fp-comp-otro').hidden = t.value !== '__otro'; return; }
  const box = t.closest('.linea'); if (!box) return;
  const l = FP.d.lineas[Number(box.dataset.i)];
  if (t.dataset.mes) {
    const msg = R.editar(l, t.dataset.mes, t.value);
    pintarLineas(); if (msg) aviso(msg);
    const sig = FP.el.querySelector(`.linea[data-i="${box.dataset.i}"] input[data-mes="${sumarMes(t.dataset.mes, 1)}"]`); if (sig && !sig.disabled) sig.focus();
    return;
  }
  const c = t.dataset.l;
  if (c === 'prod') { l.prod = t.value; return; }
  if (c === 'total') { l.total = Math.max(0, Math.round(Number(t.value) || 0)) || ''; R.total(l); pintarLineas(); return; }
  if (c === 'mes' || c === 'plazo') {
    const nuevo = c === 'mes' ? t.value : Number(t.value);
    const habiaFijos = l.fij.size > 0;
    if (habiaFijos && !(await confirmar('¿Cambiar ' + (c === 'mes' ? 'el inicio' : 'la duración') + '?', 'Se borran los meses fijados (🔒) de esta línea y el total se vuelve a repartir con la curva del tipo de proyecto.', 'Cambiar'))) { pintarLineas(); return; }
    l[c] = nuevo; R.todo(l); pintarLineas();
  }
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
  if (b.dataset.fpTipo) {
    leerForm(); d.tipo = b.dataset.fpTipo;
    FP.el.querySelectorAll('[data-fp-tipo]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    d.lineas.forEach(l => { if (Number(l.total) > 0) R.total(l); });   // la curva cambia con el tipo; se respetan los fijados
    pintarLineas(); return;
  }
  if (b.dataset.fpEstado) { d.estado = b.dataset.fpEstado; FP.el.querySelectorAll('[data-fp-estado]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('fp-comp-w').hidden = d.estado !== 'Competencia'; return; }
  if (b.dataset.lugar !== undefined) { const l = FP.lugares[Number(b.dataset.lugar)]; if (l) { ponerMarca([l.lat, l.lng], true); if (FP.map) FP.map.setZoom(16); $('fp-lugares').innerHTML = ''; } return; }
  if (b.dataset.agregar) {
    const c = d.lineas.find(l => l.neg === 'concreto') || d.lineas[0];
    d.lineas.push(nuevaLinea(b.dataset.agregar, c)); pintarLineas();
    const ult = FP.el.querySelector('.linea:last-child'); if (ult) { ult.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const i = ult.querySelector('[data-l="prod"], [data-l="total"]'); if (i) i.focus(); }
    return;
  }
  const box = b.closest('.linea'), l = box ? d.lineas[Number(box.dataset.i)] : null;
  if (b.dataset.quitar !== undefined) { if (d.lineas.length > 1) { d.lineas.splice(Number(b.dataset.quitar), 1); pintarLineas(); } return; }
  if (b.dataset.cat !== undefined && l) { l.cat = l.cat === b.dataset.cat ? '' : b.dataset.cat; pintarLineas(); return; }
  if (b.dataset.soltar && l) { l.fij.delete(b.dataset.soltar); pintarLineas(); return; }
  if (b.dataset.restablecer !== undefined && l) { R.restablecer(l); pintarLineas(); return; }
  if (b.dataset.cuadre && l) {
    if (b.dataset.cuadre === 'suma') { R.usarSuma(l); aviso(NEG[l.neg].n + ': el total quedó en ' + fmt(l.total) + ' ' + NEG[l.neg].u + '.'); }
    else { R.repartirFalta(l); aviso(NEG[l.neg].n + ': lo que faltaba quedó repartido en los meses que vienen.'); }
    const e = $('fp-err'); if (e) e.textContent = '';
    pintarLineas(); return;
  }
  const a = b.dataset.fp;
  if (a === 'cerrar') { cerrarFormulario(); return; }
  if (a === 'buscar') {
    const t = $('fp-ref').value.trim(); if (t.length < 3) { aviso('Escriba al menos 3 letras de la dirección.'); return; }
    b.disabled = true; b.textContent = 'Buscando…';
    try {
      FP.lugares = (await CTX.api('proyectos.buscarLugar', { texto: t })) || [];
      $('fp-lugares').innerHTML = FP.lugares.length ? `<div class="lugares">${FP.lugares.map((l2, i) => `<button type="button" data-lugar="${i}">${esc(l2.nombre)}</button>`).join('')}</div>` : `<p class="nota">No se encontró esa dirección. Marque el punto en el mapa o deje solo la referencia escrita.</p>`;
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
    const malLinea = d.lineas.map((l2, i) => {
      const n = NEG[l2.neg].n, st = R.estado(l2);
      if (l2.neg === 'prefabricados' && !l2.prod) return `${n}: elija el producto.`;
      if (!st.total) return `${n}: escriba el total.`;
      if (!st.ok) return `${n}: los meses no suman el total. Elija una de las opciones del aviso de esa línea.`;
      return '';
    }).filter(Boolean)[0];
    const falta = !d.cliente ? 'Escriba el cliente.' : !d.proyecto ? 'Escriba el nombre del proyecto.' : !d.tipo ? 'Elija el tipo de proyecto.' : (d.lat == null && !d.ref) ? 'Marque el punto en el mapa o escriba la dirección.' : (d.estado === 'Competencia' && !d.comp) ? 'Indique el competidor.' : malLinea || '';
    if (falta) {
      err.textContent = falta;
      const cu = FP.el.querySelector('.cuadre');
      (malLinea && cu && /no suman/.test(malLinea) ? cu : err).scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    b.disabled = true; b.textContent = 'Guardando…';
    try {
      const r = await CTX.api('proyectos.guardar', {
        id: d.id, cliente: d.cliente, proyecto: d.proyecto, tipo: d.tipo, ref: d.ref, lat: d.lat, lng: d.lng, estado: d.estado, comp: d.comp, notas: d.notas,
        asesor: D.editaTodo ? d.asesor : undefined,
        lineas: d.lineas.map(l2 => { const m = {}; R.meses(l2).forEach(k => { m[k] = l2.m[k] || 0; }); return { id: l2.id, neg: l2.neg, cat: l2.cat, prod: l2.prod, total: Number(l2.total), mes: l2.mes, plazo: Number(l2.plazo), m, fij: [...l2.fij] }; })
      });
      const nuevo = !FP.p;
      D = r.datos; V.cargado = Date.now(); V.abierto = r.id;
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
    if (p) { V.abierto = p.id; pintar(); abrirFormulario(p); } else aviso('No se encontró el proyecto ' + params.editar + '.', 'error');
  } else if (params.nuevo) abrirFormulario(null);
  history.replaceState(null, '', '#proyectos');
}

/* ---------- registro en el cascarón ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden && vivo() && V.visible && (!FP.el || FP.el.hidden)) refrescar(); });
MV.registrar('proyectos', {
  relleno: false,
  async montar(el, ctx) {
    CTX = ctx; RAIZ = el; D = null;
    Object.assign(V, { visible: true, sucio: false, abierto: '', max: 150 });
    Object.assign(F, { q: '', asesor: '', zona: '', seg: '', prod: '', desde: '', hasta: '' }); F.estados.clear();
    if (FP.el) cerrarFormulario();
    el.innerHTML = '<div class="proy-raiz"><div class="proy-cargando"><span class="mv-giro"></span> Cargando proyectos…</div></div>';
    const d = await ctx.api('proyectos.cargar');
    // Si el cascarón volvió a montar el módulo mientras esperábamos (p. ej. cambiaron los roles), este montaje ya no vale.
    if (RAIZ !== el || !el.isConnected) return;
    aplicar(d);
    eventosLista();
    pintar();
    atenderParams(ctx.params);
  },
  async mostrar(ctx) {
    CTX = ctx; V.visible = true;
    if ((V.sucio || Date.now() - V.cargado > 120000) && (!FP.el || FP.el.hidden)) { V.sucio = false; await refrescar(); }
    atenderParams(ctx.params);
  },
  ocultar() { V.visible = false; if (FP.el && !FP.el.hidden) cerrarFormulario(); }
});
})();
