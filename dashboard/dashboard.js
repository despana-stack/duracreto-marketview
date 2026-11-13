/* Duracreto MarketView — módulo «Dashboard» (chat Dashboard).
 * Puente temporal: mientras no esté conectado a SAP, los datos vienen de la plantilla de IT a través del servidor
 * (dashboard.cargar / dashboard.refrescar → apps-script/Dashboard.gs), que filtra según el perfil.
 * Gráficos con Chart.js 4.4.1 (cdnjs, se carga al montar). Estilos en dashboard.css con prefijo .dash-.
 * En el navegador solo se guardan el periodo, la vista y la unidad elegidos; nunca los datos.
 */
(function () {
  'use strict';

  const CHART_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  const K = { periodo: 'mv_dash_periodo', vista: 'mv_dash_vista', unidad: 'mv_dash_unidad' };
  const POR_PAGINA = 25;
  const CORTO = { nov: 'Nov', dic: 'Dic', s4: 'Nov+Dic' };

  let raiz = null, C = null, P = null;          // div del módulo, ctx, paquete {datos, fuente}
  let charts = {}, libChart = null, tBusca = 0, rafTema = 0, cargando = false;
  let generacion = 0;                            // sube en desmontar(): una carga que vuelve después ya no dibuja
  const est = { periodo: null, vista: 'L', unidad: null, q: '', estado: '', unidadF: '', asesor: '', pagina: 0 };
  const mqCel = window.matchMedia('(max-width: 759px)');
  const mqMov = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ===================== Utilidades ===================== */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => typeof v === 'number' && isFinite(v);
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: no pasa nada */ } };
  const nf = (v, d) => v.toLocaleString('es-HN', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

  /** Lempiras compactos: «L 12.4 M», «L 845 mil», «L 920». */
  function fmtL(v) {
    if (!num(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return s + 'L ' + nf(a / 1e6, 1) + ' M';
    if (a >= 1e3) return s + 'L ' + nf(Math.round(a / 1e3)) + ' mil';
    return s + 'L ' + nf(Math.round(a));
  }
  const fmtLc = v => num(v) ? (v < 0 ? '−' : '') + 'L ' + nf(Math.abs(v), Math.abs(v) < 100 && v % 1 ? 2 : 0) : '—';
  const fmtPct = v => num(v) ? nf(v * 100, 1) + ' %' : '—';
  const fmtN = (v, um) => num(v) ? nf(v, Math.abs(v) < 10 && v % 1 ? 1 : 0) + (um ? ' ' + um : '') : '—';
  /** En la vista Volumen, las cifras van en la unidad de medida de la unidad elegida. */
  const fmtV = v => est.vista === 'V' ? fmtN(v, umActual()) : fmtL(v);

  function fecha(txt, conHora) {      // «2026-11-10T16:31» o «2026-11-10 16:31» → «10/11/2026 16:31»
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(txt || ''));
    if (!m) return String(txt || '—');
    return conHora === 'corta' ? m[3] + '/' + m[2] : m[3] + '/' + m[2] + '/' + m[1] + (conHora && m[4] ? ' ' + m[4] + ':' + m[5] : '');
  }

  /** Días completos entre una fecha «aaaa-mm-dd» y hoy (hora local). null si no hay fecha. */
  function diasDesde(txt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(txt || ''));
    if (!m) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((hoy - new Date(+m[1], m[2] - 1, +m[3])) / 864e5);
  }

  const IC = {
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    actualizar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17l9-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    abajo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  /* ===================== Datos según periodo y vista ===================== */
  const D = () => P.datos;
  const unidadesVol = () => (D().volumen && D().volumen.unidades) || [];
  function uVol() {
    const us = unidadesVol();
    return us.find(u => u.nombre === est.unidad) || us[0] || null;
  }
  const umActual = () => (uVol() && uVol().um) || '';
  /** Totales del periodo en la vista elegida. */
  function totales(per) {
    per = per || est.periodo;
    if (est.vista === 'V') { const u = uVol(); return (u && u.totales && u.totales[per]) || {}; }
    return (D().totales && D().totales[per]) || {};
  }
  function asesores() {
    if (est.vista === 'V') { const u = uVol(); return (u && u.asesores) || []; }
    return D().asesores || [];
  }
  /** Clase de color según el estatus de IT; si no viene, se calcula con los umbrales (cumplimiento ÷ avance esperado). */
  function claseEstatus(o, avance) {
    const t = String((o && o.estatus) || '').toLowerCase();
    if (t.indexOf('en ritmo') >= 0) return 'ok';
    if (t.indexOf('riesgo') >= 0) return 'warn';
    if (t.indexOf('bajo') >= 0) return 'bad';
    if (t) return 'neutro';
    const u = D().umbrales || { en_ritmo: 1, en_riesgo: 0.85 };
    if (!o || !num(o.cumpl_facturado) || !num(avance) || !avance) return 'neutro';
    const r = o.cumpl_facturado / avance;
    return r >= u.en_ritmo ? 'ok' : r >= u.en_riesgo ? 'warn' : 'bad';
  }
  const ICONO_ESTATUS = { ok: IC.ok, warn: IC.alerta, bad: IC.abajo, neutro: IC.reloj };
  function chipEstatus(o, avance) {
    const c = claseEstatus(o, avance), t = (o && o.estatus) || (c === 'neutro' ? 'Sin dato' : '');
    return `<span class="dash-est ${c}">${ICONO_ESTATUS[c]}${esc(t)}</span>`;
  }

  /* ===================== Gráficos ===================== */
  function cargarChart() {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (libChart) return libChart;
    libChart = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = CHART_URL; s.async = true;
      s.onload = () => window.Chart ? ok(window.Chart) : mal(new Error('Chart.js no cargó'));
      s.onerror = () => { libChart = null; s.remove(); mal(new Error('No se pudieron cargar los gráficos.')); };
      document.head.appendChild(s);
    });
    return libChart;
  }
  function colores() {
    const cs = getComputedStyle(raiz.querySelector('.dash-raiz') || raiz), v = n => cs.getPropertyValue(n).trim();
    return { fact: v('--dash-c1'), persp: v('--dash-c2'), meta: v('--dash-meta'), fg: v('--fg'), muted: v('--muted'), line: v('--line'), surface: v('--surface') };
  }
  function opcionesBase(c, horizontal) {
    const eje = { grid: { color: c.line, drawTicks: false }, border: { display: false }, ticks: { color: c.muted, padding: 6, font: { size: 11 } } };
    const ejeCat = { grid: { display: false }, border: { color: c.line }, ticks: { color: c.fg, font: { size: 11 }, autoSkip: false } };
    const valor = Object.assign({}, eje, { ticks: Object.assign({}, eje.ticks, { maxRotation: 0, autoSkip: true, maxTicksLimit: horizontal ? 5 : 7, callback: v => est.vista === 'V' ? nf(v) : fmtL(v) }) });
    return {
      responsive: true, maintainAspectRatio: false,
      animation: mqMov.matches ? false : { duration: 350 },
      interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
      plugins: {
        legend: { position: 'bottom', labels: { color: c.fg, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 14, font: { size: 12 } } },
        tooltip: { backgroundColor: c.surface, titleColor: c.fg, bodyColor: c.fg, borderColor: c.line, borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true }
      },
      scales: horizontal ? { x: valor, y: ejeCat } : { x: ejeCat, y: valor }
    };
  }
  function grafico(nombre, cfg) {
    if (charts[nombre]) { charts[nombre].destroy(); delete charts[nombre]; }
    const cv = raiz.querySelector('[data-graf="' + nombre + '"]');
    if (!cv || !window.Chart) return;
    charts[nombre] = new window.Chart(cv, cfg);
  }
  function destruirGraficos() { Object.keys(charts).forEach(k => { try { charts[k].destroy(); } catch (e) {} delete charts[k]; }); }

  function dibujarGraficos() {
    if (!P || !raiz) return;
    if (!window.Chart) {
      raiz.querySelectorAll('.dash-lienzo').forEach(x => { x.innerHTML = '<p class="dash-nota">No se pudieron cargar los gráficos (revise la conexión). Las cifras de las tarjetas sí están al día.</p>'; });
      return;
    }
    const c = colores();
    window.Chart.defaults.font.family = getComputedStyle(raiz).fontFamily;
    graficoUnidades(c);
    graficoTendencia(c);
    graficoPlantas(c);
  }

  function graficoUnidades(c) {
    if (est.vista === 'V') return;                       // en volumen cada unidad tiene su propia medida: van como barras de avance
    const us = D().unidades || [], per = est.periodo, hz = mqCel.matches;
    const val = k => us.map(u => (u[per] && num(u[per][k])) ? u[per][k] : 0);
    const barra = { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 16, categoryPercentage: 0.78, barPercentage: 0.9, borderWidth: 0 };
    const op = opcionesBase(c, hz);
    op.plugins.tooltip.callbacks = { label: x => ' ' + x.dataset.label + ': ' + fmtLc(x.raw) };
    grafico('unidades', {
      type: 'bar',
      data: {
        labels: us.map(u => hz ? u.nombre : partir(u.nombre)),
        datasets: [
          Object.assign({ label: 'Facturado', data: val('facturado'), backgroundColor: c.fact }, barra),
          Object.assign({ label: 'Perspectivas (ganado)', data: val('persp_total'), backgroundColor: c.persp }, barra),
          Object.assign({ label: 'Meta', data: val('meta'), backgroundColor: c.meta }, barra)
        ]
      },
      options: Object.assign(op, { indexAxis: hz ? 'y' : 'x' })
    });
  }
  /** Nombres largos en dos líneas bajo las barras verticales. */
  function partir(t) {
    const p = String(t).split(' ');
    if (p.length < 2 || t.length < 12) return t;
    const mitad = Math.ceil(p.length / 2);
    return [p.slice(0, mitad).join(' '), p.slice(mitad).join(' ')];
  }

  /** Mes que se dibuja en «Facturación acumulada»: el del periodo; en Nov+Dic, el último que ya tiene facturación. */
  function mesTendencia() {
    if (est.periodo !== 's4') return est.periodo;
    const t = fuenteTendencia();
    return t && t.dic && t.dic.serie && t.dic.serie.length ? 'dic' : 'nov';
  }
  function fuenteTendencia() {
    if (est.vista === 'V') { const u = uVol(); return u && u.tendencia; }
    return D().tendencia;
  }
  function datosTendencia() {
    const mes = mesTendencia(), t = (fuenteTendencia() || {})[mes];
    if (!t) return null;
    const meta = totales(mes).meta;
    const dias = t.dias_mes || (t.ritmo || []).length || 30;
    const serie = (t.serie || []).slice().sort((a, b) => a.dia - b.dia);
    const ultimo = serie.length ? serie[serie.length - 1].dia : 0;
    const real = [];
    let acum = null, j = 0;
    for (let d = 1; d <= dias; d++) {
      while (j < serie.length && serie[j].dia <= d) { acum = serie[j].acumulado; j++; }
      real.push(d <= ultimo ? (acum == null ? 0 : acum) : null);
    }
    const ritmo = num(meta) ? (t.ritmo || []).map(r => num(r) ? r * meta : null) : [];
    return { mes, dias, real, ritmo, ultimo, meta, alCorte: ultimo ? real[ultimo - 1] : null, ritmoCorte: ultimo && ritmo.length ? ritmo[ultimo - 1] : null };
  }
  function graficoTendencia(c) {
    const t = datosTendencia();
    if (!t) return;
    const op = opcionesBase(c, false);
    op.scales.x.ticks.autoSkip = true; op.scales.x.ticks.maxRotation = 0;
    op.scales.x.title = { display: true, text: 'Día del mes', color: c.muted, font: { size: 11 } };
    op.plugins.tooltip.callbacks = {
      title: x => 'Día ' + x[0].label,
      label: x => x.raw == null ? null : ' ' + x.dataset.label + ': ' + (est.vista === 'V' ? fmtN(x.raw, umActual()) : fmtLc(Math.round(x.raw)))
    };
    grafico('tendencia', {
      type: 'line',
      data: {
        labels: Array.from({ length: t.dias }, (_, i) => String(i + 1)),
        datasets: [
          { label: 'Facturado acumulado', data: t.real, borderColor: c.fact, backgroundColor: c.fact, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: c.surface, pointBorderWidth: 2, tension: 0, spanGaps: false },
          { label: 'Ritmo de la meta', data: t.ritmo, borderColor: c.meta, backgroundColor: c.meta, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 4, tension: 0 }
        ]
      },
      options: op
    });
  }
  function graficoPlantas(c) {
    const ps = plantasOrdenadas();
    const op = opcionesBase(c, true);
    op.plugins.legend.display = false;
    op.plugins.tooltip.callbacks = { label: x => ' Facturado: ' + fmtLc(x.raw) };
    op.scales.x.ticks.callback = v => fmtL(v);
    grafico('plantas', {
      type: 'bar',
      data: { labels: ps.map(p => p.nombre), datasets: [{ label: 'Facturado', data: ps.map(p => p[est.periodo] || 0), backgroundColor: c.fact, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18, borderWidth: 0 }] },
      options: Object.assign(op, { indexAxis: 'y' })
    });
  }
  const plantasOrdenadas = () => (D().plantas || []).slice().sort((a, b) => (b[est.periodo] || 0) - (a[est.periodo] || 0));

  /* ===================== Pantallas ===================== */
  function esqueleto() {
    raiz.innerHTML = `<div class="dash-raiz">
      <div class="dash-barra dash-esq"><span></span><span></span><span></span></div>
      <div class="dash-cargando mv-card"><span class="mv-giro"></span> Cargando el Dashboard…</div>
      <div class="dash-kpis">${'<div class="mv-card dash-kpi dash-esq"><span></span><span></span></div>'.repeat(5)}</div>
      <div class="mv-card dash-esq dash-esq-alto"></div></div>`;
  }
  function pantallaSinAcceso(msg) {
    destruirGraficos();
    raiz.innerHTML = `<div class="dash-raiz"><div class="mv-card dash-vacio">
      <div class="dash-vacio-ic">${IC.alerta}</div><h2>Sin acceso al Dashboard</h2>
      <p>${esc(msg || 'El Dashboard es solo para dirección y gerencia.')}</p>
      <p class="dash-nota">Si cree que debería verlo, escriba a Diego España.</p></div></div>`;
  }
  function pantallaError(e) {
    destruirGraficos();
    const demo = C.demo ? '<p class="dash-nota">Modo de prueba: el Dashboard necesita el servidor (falta la dirección en config.js).</p>' : '';
    raiz.innerHTML = `<div class="dash-raiz"><div class="mv-card dash-vacio">
      <div class="dash-vacio-ic bad">${IC.alerta}</div><h2>No se pudo cargar el Dashboard</h2>
      <p>${esc((e && e.message) || 'Ocurrió un error.')}</p>${demo}
      <button class="mv-btn primario" type="button" data-acc="reintentar">Reintentar</button></div></div>`;
  }

  async function cargar(forzar) {
    if (cargando) return;
    cargando = true;
    const gen = generacion;
    const habia = !!P;
    const btn = raiz.querySelector('[data-acc="actualizar"]');
    if (btn) { btn.disabled = true; btn.classList.add('girando'); }
    if (!habia) esqueleto();
    try {
      const [paquete] = await Promise.all([
        C.api(forzar ? 'dashboard.refrescar' : 'dashboard.cargar', {}, { tiempo: 90 }),
        cargarChart().catch(() => null)            // si la librería no carga, las tarjetas igual se muestran
      ]);
      if (gen !== generacion || !raiz) return;      // el módulo se desmontó mientras esperaba
      P = paquete;
      prepararEstado();
      pintar();
      if (forzar) C.aviso(P.fuente.origen === 'respaldo' ? 'La plantilla de IT no respondió: se muestra la copia guardada.' : 'Dashboard actualizado con la plantilla de IT.', P.fuente.origen === 'respaldo' ? 'error' : undefined);
    } catch (e) {
      if (gen !== generacion || !raiz) return;
      if (habia) {                                  // falló «Actualizar»: se conserva lo que ya se veía
        C.aviso(e.message || 'No se pudo actualizar.', 'error');
        if (btn) { btn.disabled = false; btn.classList.remove('girando'); }
      } else if (e.codigo === 'permiso') pantallaSinAcceso(e.message);
      else pantallaError(e);
    } finally { if (gen === generacion) cargando = false; }
  }

  function prepararEstado() {
    const ps = (D().periodos || [{ clave: 'nov' }, { clave: 'dic' }, { clave: 's4' }]).map(p => p.clave);
    if (!est.periodo || ps.indexOf(est.periodo) < 0) {
      const g = lsGet(K.periodo);
      if (g && ps.indexOf(g) >= 0) est.periodo = g;
      else {                                        // por defecto: el último mes que ya tiene facturación
        const conFact = ps.filter(k => k !== 's4' && D().totales[k] && num(D().totales[k].facturado));
        est.periodo = conFact[conFact.length - 1] || ps[0];
      }
    }
    if (!est._vistaLeida) { est.vista = lsGet(K.vista) === 'V' ? 'V' : 'L'; est._vistaLeida = true; }
    if (!unidadesVol().length) est.vista = 'L';
    if (!est.unidad) est.unidad = lsGet(K.unidad);
    if (!unidadesVol().some(u => u.nombre === est.unidad)) est.unidad = unidadesVol()[0] ? unidadesVol()[0].nombre : null;
  }

  /* ===================== Dibujo completo ===================== */
  function pintar() {
    const scroll = raiz.scrollTop;
    destruirGraficos();
    const d = D();
    raiz.innerHTML = `<div class="dash-raiz">${barra()}<div class="dash-cuerpo">
      ${seccionKpis()}${seccionVeredicto()}${seccionUnidades()}${seccionZonas()}
      <div class="dash-dos">${seccionRanking()}${seccionTendencia()}</div>
      ${seccionProyectos()}${seccionPlantas()}${seccionNotas()}
      <p class="dash-pie">Fuente temporal: plantilla de IT (Netlify). El Dashboard final se conectará a SAP.</p>
    </div><div class="dash-panel" hidden></div></div>`;
    pintarProyectos();
    dibujarGraficos();
    raiz.scrollTop = scroll;
  }

  function barra() {
    const f = P.fuente || {}, d = D();
    const ps = d.periodos || [{ clave: 'nov', nombre: 'Noviembre' }, { clave: 'dic', nombre: 'Diciembre' }, { clave: 's4', nombre: 'Nov + Dic' }];
    const seg = (acc, items, actual) => `<div class="dash-seg" role="group">${items.map(i =>
      `<button type="button" data-acc="${acc}" data-v="${esc(i.v)}" aria-pressed="${i.v === actual}" title="${esc(i.t || i.n)}">${esc(i.n)}</button>`).join('')}</div>`;
    const m = d.meta || {};
    const fFact = m.corte_facturado_txt || (m.corte_facturado ? fecha(m.corte_facturado) : '');
    const fCuadro = m.fecha_cuadro_txt || (m.fecha_cuadro ? fecha(m.fecha_cuadro) : '');
    const fechas = [fFact ? 'Facturado al ' + fFact : '', fCuadro ? 'Perspectivas al ' + fCuadro : ''].filter(Boolean).join(' · ')
      || 'Corte: ' + fecha(f.corte || m.generado, true);
    const atraso = diasDesde(m.corte_facturado);
    let corte;
    if (f.origen === 'respaldo')                    // la copia guardada tiene prioridad sobre cualquier otro aviso
      corte = `<span class="dash-corte aviso" title="${esc(f.aviso || '')} ${esc(fechas)}">${IC.alerta}Copia guardada del ${esc(fecha(f.leido, 'corta'))} — la plantilla de IT no respondió</span>`;
    else if (atraso > 3)
      corte = `<span class="dash-corte aviso" title="${esc(fechas)}">${IC.alerta}<span>Datos de IT sin actualizar desde hace ${atraso} días <small>(${esc(fechas.replace('Facturado', 'facturado').replace('Perspectivas', 'perspectivas'))})</small></span></span>`;
    else
      corte = `<span class="dash-corte" title="Leído ${esc(f.leido || '')} (${esc(f.origen || '')})">${IC.reloj}${esc(fechas)}</span>`;
    const puede = C.rol === 'editor' && !(C.usuario && C.usuario.soloLectura);
    const unid = est.vista === 'V' ? `<div class="dash-unids" role="group" aria-label="Unidad de negocio">${unidadesVol().map(u =>
      `<button type="button" class="dash-chip" data-acc="unidad" data-v="${esc(u.nombre)}" aria-pressed="${u.nombre === est.unidad}">${esc(u.nombre)} <small>${esc(u.um)}</small></button>`).join('')}</div>` : '';
    return `<div class="dash-barra">
      ${seg('periodo', ps.map(p => ({ v: p.clave, n: CORTO[p.clave] || p.nombre, t: p.nombre })), est.periodo)}
      ${unidadesVol().length ? seg('vista', [{ v: 'L', n: 'Lempiras' }, { v: 'V', n: 'Volumen' }], est.vista) : ''}
      ${corte}
      ${puede ? `<button type="button" class="mv-btn dash-act" data-acc="actualizar" title="Volver a leer la plantilla de IT ahora">${IC.actualizar}<span>Actualizar</span></button>` : ''}
    </div>${unid}`;
  }

  function kpi(titulo, valor, sub, extra, cls) {
    return `<div class="mv-card dash-kpi ${cls || ''}"><span class="dash-kpi-t">${titulo}</span><b class="dash-kpi-v">${valor}</b>${extra || ''}<span class="dash-kpi-s">${sub || ''}</span></div>`;
  }
  function seccionKpis() {
    const t = totales(), c = claseEstatus(t, t.avance), um = est.vista === 'V' ? ' · ' + esc(est.unidad) : '';
    const sinFact = !num(t.facturado);
    const barraAv = num(t.cumpl_facturado) ? `<div class="dash-av ${c}" aria-hidden="true"><i style="width:${Math.min(100, t.cumpl_facturado * 100)}%"></i>${num(t.avance) ? `<em style="left:${Math.min(100, t.avance * 100)}%" title="Ritmo esperado"></em>` : ''}</div>` : '';
    return `<section class="dash-kpis" aria-label="Indicadores">
      ${kpi('Cumplimiento' + um, fmtPct(t.cumpl_facturado), num(t.avance) ? 'Ritmo esperado al corte: ' + fmtPct(t.avance) : 'Facturado ÷ meta forecast', chipEstatus(t, t.avance) + barraAv, 'dash-kpi-cumpl ' + c)}
      ${kpi('Meta forecast', fmtV(t.meta), est.vista === 'V' ? 'Cantidad del forecast oficial' : 'Forecast oficial de Presidencia')}
      ${kpi('Facturado real', sinFact ? '—' : fmtV(t.facturado), sinFact ? 'Sin facturación todavía' : (num(t.documentos) ? nf(t.documentos) + ' documentos' : 'Reporte de ventas SAP'))}
      ${kpi('Perspectivas', fmtV(t.persp_total), (num(t.n_ganado) ? nf(t.n_ganado) + ' ganados' : 'Ganados') + (num(t.perspectiva) && t.perspectiva ? ' · ' + fmtV(t.perspectiva) + ' en negociación' : ''))}
      ${kpi('Proyección de cierre', fmtV(t.proyeccion), num(t.cumpl_proyeccion) ? fmtPct(t.cumpl_proyeccion) + ' de la meta' : 'Facturado + perspectivas')}
    </section>`;
  }

  function seccionVeredicto() {
    const v = D().veredicto;
    if (!v || !(v.advertencias > 0 || v.bloqueantes > 0)) return '';
    const malo = v.go === false || v.bloqueantes > 0;
    const partes = [];
    if (v.bloqueantes) partes.push(nf(v.bloqueantes) + ' bloqueantes');
    if (v.advertencias) partes.push(nf(v.advertencias) + ' advertencias');
    if (v.informativos) partes.push(nf(v.informativos) + ' informativos');
    if (v.aprobados) partes.push(nf(v.aprobados) + ' aprobados');
    return `<div class="dash-franja ${malo ? 'bad' : 'warn'}" role="note">${IC.alerta}
      <span><b>Revisión de IT: ${esc(v.texto || (v.go ? 'GO' : 'NO GO'))}</b> · ${partes.join(' · ')}</span>
      <button type="button" data-acc="notas">Ver notas</button></div>`;
  }

  function seccionUnidades() {
    if (est.vista === 'V') {
      const filas = unidadesVol().map(u => {
        const t = (u.totales && u.totales[est.periodo]) || {}, c = claseEstatus(t, t.avance);
        const pf = num(t.meta) && t.meta ? t.facturado / t.meta : null, pp = num(t.meta) && t.meta ? t.proyeccion / t.meta : null;
        return `<button type="button" class="dash-uv${u.nombre === est.unidad ? ' sel' : ''}" data-acc="unidad" data-v="${esc(u.nombre)}">
          <span class="dash-uv-n">${esc(u.nombre)}</span>${chipEstatus(t, t.avance)}
          <span class="dash-doble" aria-hidden="true"><i class="p" style="width:${Math.min(100, (pp || 0) * 100)}%"></i><i class="f" style="width:${Math.min(100, (pf || 0) * 100)}%"></i></span>
          <span class="dash-uv-c">Facturado <b>${fmtN(t.facturado, u.um)}</b> · Proyección ${fmtN(t.proyeccion, u.um)} · Meta ${fmtN(t.meta, u.um)} · <b>${fmtPct(t.cumpl_facturado)}</b></span>
        </button>`;
      }).join('');
      return `<section class="mv-card dash-sec"><h2>Unidades de negocio <small>volumen, cada una en su medida</small></h2>
        <div class="dash-leyenda"><span><i class="f"></i>Facturado</span><span><i class="p"></i>Proyección de cierre</span><span>Barra completa = meta</span></div>
        <div class="dash-uvs">${filas}</div></section>`;
    }
    const us = D().unidades || [];
    const alto = mqCel.matches ? Math.max(260, us.length * 66) : 320;
    const chips = us.map(u => { const t = u[est.periodo] || {};
      return `<li><span>${esc(u.nombre)}</span><b>${u.con_meta === false ? 'sin meta' : fmtPct(t.cumpl_facturado)}</b>${u.con_meta === false ? '' : chipEstatus(t, totales().avance)}</li>`; }).join('');
    return `<section class="mv-card dash-sec"><h2>Unidades de negocio</h2>
      <div class="dash-lienzo" style="height:${alto}px"><canvas data-graf="unidades" role="img" aria-label="Facturado, perspectivas y meta por unidad de negocio"></canvas></div>
      <ul class="dash-cumpl">${chips}</ul></section>`;
  }

  function seccionZonas() {
    const zs = D().zonas || [];
    if (!zs.length) return '';
    const nota = est.vista === 'V' ? '<small>en lempiras (la plantilla no trae volumen por zona)</small>' : '';
    return `<section class="dash-sec-plana"><h2>Zonas ${nota}</h2><div class="dash-zonas">${zs.map(z => {
      const t = z[est.periodo] || {}, av = (D().totales[est.periodo] || {}).avance;
      return `<div class="mv-card dash-zona"><div class="dash-zona-t"><b>${esc(z.nombre)}</b><small>${num(z.n_asesores) ? z.n_asesores + ' asesores' : ''}</small></div>
        <div class="dash-zona-v"><b>${fmtPct(t.cumpl_facturado)}</b>${chipEstatus(t, av)}</div>
        <dl><div><dt>Facturado</dt><dd>${fmtL(t.facturado)}</dd></div><div><dt>Meta</dt><dd>${fmtL(t.meta)}</dd></div><div><dt>Proyección</dt><dd>${fmtL(t.proyeccion)} <small>${fmtPct(t.cumpl_proyeccion)}</small></dd></div></dl></div>`;
    }).join('')}</div></section>`;
  }

  /** Asesores ordenados por cumplimiento (facturado ÷ meta individual; si el periodo aún no tiene facturación, por proyección). */
  function ranking() {
    const per = est.periodo, base = D().asesores || [];
    const info = n => base.find(a => a.nombre === n) || {};
    const conFact = asesores().some(a => a[per] && num(a[per].facturado));
    const clave = conFact ? 'cumpl_facturado' : 'cumpl_proyeccion';
    return { clave, filas: asesores().map(a => Object.assign({ a, t: a[per] || {}, i: info(a.nombre) })).sort((x, y) => {
      if (!!x.a.es_oficina !== !!y.a.es_oficina) return x.a.es_oficina ? 1 : -1;
      const vx = num(x.t[clave]) && x.t.meta ? x.t[clave] : -1, vy = num(y.t[clave]) && y.t.meta ? y.t[clave] : -1;
      return vy - vx || (y.t.facturado || 0) - (x.t.facturado || 0);
    }) };
  }
  function seccionRanking() {
    const r = ranking(), av = totales().avance;
    const filas = r.filas.map((f, n) => {
      const t = f.t, sinMeta = !num(t.meta) || !t.meta, c = sinMeta ? 'neutro' : claseEstatus(t, av);
      const alertas = f.i.alertas || 0, sinPrecio = (f.i[est.periodo] && f.i[est.periodo].sin_precio_n) || 0;
      const marca = alertas || sinPrecio ? `<span class="dash-alerta" title="${[alertas ? alertas + ' alertas en sus proyectos' : '', sinPrecio ? sinPrecio + ' productos sin precio' : ''].filter(Boolean).join(' · ')}">${IC.alerta}<span class="dash-sr">Tiene alertas</span></span>` : '';
      const pf = num(t.cumpl_facturado) ? t.cumpl_facturado : 0, pp = num(t.cumpl_proyeccion) ? t.cumpl_proyeccion : 0;
      const cifra = sinMeta ? 'sin meta' : fmtPct(t[r.clave]);
      return `<li><button type="button" class="dash-as" data-acc="asesor" data-v="${esc(f.a.nombre)}">
        <span class="dash-as-n"><em>${f.a.es_oficina ? '·' : n + 1}</em>${esc(f.a.nombre)}${marca}</span>
        <b class="dash-as-c ${c}">${cifra}</b>
        <span class="dash-doble" aria-hidden="true"><i class="p" style="width:${sinMeta ? 0 : Math.min(100, pp * 100)}%"></i><i class="f ${c}" style="width:${sinMeta ? 0 : Math.min(100, pf * 100)}%"></i></span>
        <span class="dash-as-s">${fmtV(t.facturado)} de ${sinMeta ? '—' : fmtV(t.meta)} · proyección ${fmtV(t.proyeccion)}</span></button></li>`;
    }).join('');
    return `<section class="mv-card dash-sec"><h2>Ranking de asesores <small>${r.clave === 'cumpl_facturado' ? 'facturado ÷ meta individual' : 'proyección ÷ meta individual'}${est.vista === 'V' ? ' · ' + esc(est.unidad) : ''}</small></h2>
      <div class="dash-leyenda"><span><i class="f"></i>Facturado</span><span><i class="p"></i>Proyección de cierre</span><span>Toque un asesor para ver sus proyectos</span></div>
      <ol class="dash-ranking">${filas}</ol></section>`;
  }

  function seccionTendencia() {
    const t = datosTendencia();
    const nombreMes = { nov: 'Noviembre', dic: 'Diciembre' }[t ? t.mes : ''] || '';
    let resumen = '';
    if (t && t.ultimo) resumen = `Al día ${t.ultimo}: <b>${fmtV(t.alCorte)}</b> facturado contra <b>${fmtV(t.ritmoCorte)}</b> del ritmo de la meta.`;
    else if (t) resumen = 'Sin facturación todavía en este mes.';
    return `<section class="mv-card dash-sec"><h2>Facturación acumulada del mes <small>${esc(nombreMes)}${est.vista === 'V' ? ' · ' + esc(est.unidad) : ''}</small></h2>
      ${t ? `<p class="dash-nota">${resumen}</p><div class="dash-lienzo" style="height:260px"><canvas data-graf="tendencia" role="img" aria-label="Facturado acumulado contra el ritmo de la meta"></canvas></div>` : '<p class="dash-nota">La plantilla no trae la serie diaria de este mes.</p>'}
    </section>`;
  }

  /* ---------- Proyectos ---------- */
  const volPer = p => est.periodo === 's4' ? sumaN(p.vol_nov, p.vol_dic) : p['vol_' + est.periodo];
  const montoPer = p => est.periodo === 's4' ? sumaN(p.monto_nov, p.monto_dic) : p['monto_' + est.periodo];
  function sumaN(a, b) { return num(a) || num(b) ? (num(a) ? a : 0) + (num(b) ? b : 0) : null; }
  const CLASE_ESTADO = { ganado: 'ok', perspectiva: 'info', competencia: 'bad' };
  const claseEstado = e => CLASE_ESTADO[String(e || '').toLowerCase()] || 'neutro';

  function seccionProyectos() {
    const ps = D().proyectos || [];
    const grupos = {};
    ps.forEach(p => { const e = p.estado || 'Sin estado'; (grupos[e] = grupos[e] || { n: 0, m: 0 }); grupos[e].n++; grupos[e].m += montoPer(p) || 0; });
    const orden = ['Ganado', 'Perspectiva', 'Competencia'];
    const estados = Object.keys(grupos).sort((a, b) => (orden.indexOf(a) + 1 || 9) - (orden.indexOf(b) + 1 || 9));
    const opciones = (lista, actual, todos) => `<option value="">${todos}</option>` + lista.map(x => `<option value="${esc(x)}"${x === actual ? ' selected' : ''}>${esc(x)}</option>`).join('');
    const unicos = k => [...new Set(ps.map(p => p[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    return `<section class="mv-card dash-sec dash-proy"><h2>Perspectivas y proyectos <small>${ps.length} proyectos · montos de ${esc(CORTO[est.periodo] || est.periodo)}</small></h2>
      <div class="dash-chips">${estados.map(e => `<button type="button" class="dash-chip ${claseEstado(e)}" data-acc="estado" data-v="${esc(e)}" aria-pressed="${est.estado === e}">
        <i></i>${esc(e)} <b>${grupos[e].n}</b><span>${fmtL(grupos[e].m)}</span></button>`).join('')}</div>
      <div class="dash-filtros">
        <input class="mv-input dash-q" type="search" placeholder="Buscar cliente, proyecto o producto" value="${esc(est.q)}" aria-label="Buscar proyectos">
        <select class="mv-input" data-filtro="estado" aria-label="Estado">${opciones(estados, est.estado, 'Todos los estados')}</select>
        <select class="mv-input" data-filtro="unidadF" aria-label="Unidad">${opciones(unicos('unidad'), est.unidadF, 'Todas las unidades')}</select>
        <select class="mv-input" data-filtro="asesor" aria-label="Asesor">${opciones(unicos('asesor'), est.asesor, 'Todos los asesores')}</select>
      </div>
      <div class="dash-lista" aria-live="polite"></div></section>`;
  }
  function filtrados() {
    const q = est.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (D().proyectos || []).filter(p =>
      (!est.estado || (p.estado || 'Sin estado') === est.estado) &&
      (!est.unidadF || p.unidad === est.unidadF) &&
      (!est.asesor || p.asesor === est.asesor) &&
      (!q || [p.cliente, p.proyecto, p.producto, p.asesor, p.planta, p.competidor].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(q) >= 0)
    ).sort((a, b) => (montoPer(b) || 0) - (montoPer(a) || 0) || (volPer(b) || 0) - (volPer(a) || 0));
  }
  function filaProyecto(p) {
    const al = (p.alertas || []).length ? `<span class="dash-alerta" title="${esc(p.alertas.join(' · '))}">${IC.alerta}<span class="dash-sr">${esc(p.alertas.join(', '))}</span></span>` : '';
    return `<div class="dash-pr" role="row">
      <div class="dash-pr-p" role="cell"><b>${esc(p.proyecto || '—')}</b>${al}<small>${esc(p.cliente || '')}</small></div>
      <div class="dash-pr-a" role="cell">${esc(p.asesor || '—')}<small>${esc(p.zona || '')}</small></div>
      <div class="dash-pr-u" role="cell">${esc(p.unidad || '—')}<small>${esc(p.producto || '')}${p.planta ? ' · ' + esc(p.planta) : ''}</small></div>
      <div class="dash-pr-e" role="cell"><span class="dash-badge ${claseEstado(p.estado)}">${esc(p.estado || 'Sin estado')}</span>${p.competidor ? `<small>${esc(p.competidor)}</small>` : ''}</div>
      <div class="dash-pr-v" role="cell"><span class="dash-et">Volumen</span>${fmtN(volPer(p), p.um)}</div>
      <div class="dash-pr-r" role="cell"><span class="dash-et">Precio</span>${num(p.precio) ? fmtLc(p.precio) : '—'}</div>
      <div class="dash-pr-m" role="cell"><span class="dash-et">Monto</span><b>${fmtLc(montoPer(p))}</b></div>
      ${p.obs ? `<div class="dash-pr-o" role="cell">${esc(p.obs)}</div>` : ''}
    </div>`;
  }
  function pintarProyectos() {
    const caja = raiz.querySelector('.dash-lista');
    if (!caja) return;
    const lista = filtrados(), total = lista.length, pags = Math.max(1, Math.ceil(total / POR_PAGINA));
    est.pagina = Math.min(est.pagina, pags - 1);
    const desde = est.pagina * POR_PAGINA, pag = lista.slice(desde, desde + POR_PAGINA);
    caja.innerHTML = total ? `<div class="dash-tabla" role="table" aria-label="Proyectos">
        <div class="dash-pr dash-pr-h" role="row"><div role="columnheader">Proyecto · cliente</div><div role="columnheader">Asesor</div><div role="columnheader">Unidad · producto</div><div role="columnheader">Estado</div><div role="columnheader">Volumen</div><div role="columnheader">Precio</div><div role="columnheader">Monto</div></div>
        ${pag.map(filaProyecto).join('')}</div>
      <div class="dash-pag"><span>${desde + 1}–${desde + pag.length} de ${total}</span>
        <button type="button" class="mv-btn" data-acc="pag" data-v="-1"${est.pagina ? '' : ' disabled'}>Anterior</button>
        <button type="button" class="mv-btn" data-acc="pag" data-v="1"${est.pagina < pags - 1 ? '' : ' disabled'}>Siguiente</button></div>`
      : '<p class="dash-nota">Ningún proyecto coincide con la búsqueda.</p>';
  }

  function seccionPlantas() {
    const ps = D().plantas || [];
    if (!ps.length) return '';
    return `<section class="mv-card dash-sec"><h2>Plantas <small>facturado de ${esc(CORTO[est.periodo] || est.periodo)}</small></h2>
      <div class="dash-lienzo" style="height:${Math.max(200, ps.length * 32 + 30)}px"><canvas data-graf="plantas" role="img" aria-label="Facturado por planta"></canvas></div>
      <p class="dash-nota">La plantilla de IT no trae volumen por planta; solo lempiras.</p></section>`;
  }

  function seccionNotas() {
    const d = D(), cal = d.calidad || [], sup = d.supuestos || [];
    const sev = s => { const t = String(s || '').toLowerCase(); return t.indexOf('bloq') >= 0 ? 'bad' : t.indexOf('adv') >= 0 ? 'warn' : 'info'; };
    const m = d.meta || {};
    const archivos = [m.archivo_forecast, m.archivo_perspectivas].concat(m.archivos_facturado || []).filter(Boolean);
    return `<details class="mv-card dash-notas"><summary><h2>Notas de los datos <small>${cal.length} revisiones de calidad · ${sup.length} supuestos</small></h2></summary>
      ${cal.length ? `<h3>Revisión de calidad (IT)</h3><ul class="dash-cal">${cal.map(c => `<li>
        <span class="dash-badge ${sev(c.severidad)}">${esc(c.severidad || 'INFO')}</span><small>${esc(c.fuente || '')}${num(c.registros) ? ' · ' + nf(c.registros) + ' registros' : ''}${num(c.impacto) ? ' · ' + fmtLc(c.impacto) : ''}</small>
        <b>${esc(c.validacion || '')}</b>${c.detalle ? `<p>${esc(c.detalle)}</p>` : ''}</li>`).join('')}</ul>` : ''}
      ${sup.length ? `<h3>Supuestos</h3><ul class="dash-sup">${sup.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${m.generado ? `<p class="dash-nota">Plantilla generada por IT el ${esc(fecha(m.generado, true))}.</p>` : ''}
      ${archivos.length ? `<p class="dash-nota">Archivos de origen: ${archivos.map(esc).join(' · ')}.</p>` : ''}
      <p class="dash-nota"><b>Fuente temporal: plantilla de IT (Netlify). El Dashboard final se conectará a SAP.</b></p></details>`;
  }

  /* ---------- Panel de un asesor ---------- */
  function abrirAsesor(nombre) {
    const panel = raiz.querySelector('.dash-panel');
    const a = asesores().find(x => x.nombre === nombre);
    if (!panel || !a) return;
    const t = a[est.periodo] || {}, info = (D().asesores || []).find(x => x.nombre === nombre) || {};
    const ps = (D().proyectos || []).filter(p => p.asesor === nombre)
      .sort((x, y) => (montoPer(y) || 0) - (montoPer(x) || 0) || (volPer(y) || 0) - (volPer(x) || 0));
    panel.innerHTML = `<div class="dash-velo" data-acc="cerrar"></div>
      <div class="dash-hoja" role="dialog" aria-modal="true" aria-labelledby="dash-hoja-t">
        <div class="dash-hoja-c"><div><h2 id="dash-hoja-t">${esc(nombre)}</h2><small>${esc(a.zona || '')}${est.vista === 'V' ? ' · ' + esc(est.unidad) : ''} · ${esc(CORTO[est.periodo] || '')}</small></div>
          <button type="button" class="dash-x" data-acc="cerrar" aria-label="Cerrar">${IC.cerrar}</button></div>
        <div class="dash-mini">
          <div><span>Cumplimiento</span><b>${fmtPct(t.cumpl_facturado)}</b></div><div><span>Facturado</span><b>${fmtV(t.facturado)}</b></div>
          <div><span>Meta</span><b>${fmtV(t.meta)}</b></div><div><span>Proyección</span><b>${fmtV(t.proyeccion)}</b></div></div>
        ${info.alertas ? `<p class="dash-franja warn">${IC.alerta}<span>${info.alertas} alertas en sus proyectos${(info[est.periodo] || {}).sin_precio_n ? ' · ' + info[est.periodo].sin_precio_n + ' productos sin precio' : ''}</span></p>` : ''}
        <h3>${ps.length} proyectos</h3>
        <div class="dash-hoja-l">${ps.length ? ps.map(filaProyecto).join('') : '<p class="dash-nota">No tiene proyectos en el cuadro de perspectivas.</p>'}</div>
      </div>`;
    panel.hidden = false;
    document.addEventListener('keydown', teclaPanel);
    panel.querySelector('.dash-x').focus();
  }
  function cerrarPanel() {
    const panel = raiz && raiz.querySelector('.dash-panel');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    document.removeEventListener('keydown', teclaPanel);
  }
  function teclaPanel(e) { if (e.key === 'Escape') cerrarPanel(); }

  /* ===================== Eventos ===================== */
  function alClic(e) {
    const b = e.target.closest('[data-acc]');
    if (!b || !raiz.contains(b)) return;
    const acc = b.dataset.acc, v = b.dataset.v;
    if (acc === 'reintentar') { P = null; cargar(false); }
    else if (acc === 'actualizar') cargar(true);
    else if (acc === 'periodo' && v !== est.periodo) { est.periodo = v; est.pagina = 0; lsSet(K.periodo, v); pintar(); }
    else if (acc === 'vista' && v !== est.vista) { est.vista = v; lsSet(K.vista, v); pintar(); }
    else if (acc === 'unidad' && v !== est.unidad) { est.unidad = v; lsSet(K.unidad, v); pintar(); }
    else if (acc === 'estado') { est.estado = est.estado === v ? '' : v; est.pagina = 0; sincronizarFiltros(); pintarProyectos(); }
    else if (acc === 'pag') { est.pagina = Math.max(0, est.pagina + Number(v)); pintarProyectos(); const s = raiz.querySelector('.dash-proy'); s && s.scrollIntoView({ block: 'start', behavior: mqMov.matches ? 'auto' : 'smooth' }); }
    else if (acc === 'asesor') abrirAsesor(v);
    else if (acc === 'cerrar') cerrarPanel();
    else if (acc === 'notas') { const n = raiz.querySelector('.dash-notas'); if (n) { n.open = true; n.scrollIntoView({ block: 'start', behavior: mqMov.matches ? 'auto' : 'smooth' }); } }
  }
  function sincronizarFiltros() {
    raiz.querySelectorAll('.dash-chips [data-acc="estado"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === est.estado)));
    const s = raiz.querySelector('[data-filtro="estado"]'); if (s) s.value = est.estado;
  }
  function alCambiar(e) {
    const f = e.target.dataset && e.target.dataset.filtro;
    if (!f) return;
    est[f] = e.target.value; est.pagina = 0;
    if (f === 'estado') sincronizarFiltros();
    pintarProyectos();
  }
  function alEscribir(e) {
    if (!e.target.classList.contains('dash-q')) return;
    clearTimeout(tBusca);
    tBusca = setTimeout(() => { est.q = e.target.value; est.pagina = 0; pintarProyectos(); }, 200);
  }
  // Cambio de tema: los colores del lienzo se vuelven a leer de las variables CSS.
  function alTema() { cancelAnimationFrame(rafTema); rafTema = requestAnimationFrame(dibujarGraficos); }
  // Cruce celular ↔ computadora: las barras de unidades cambian de orientación.
  function alCambiarAncho() { if (P && raiz) pintar(); }

  MV.registrar('dashboard', {
    relleno: true,
    async montar(el, ctx) {
      raiz = el; C = ctx;
      el.addEventListener('click', alClic);
      el.addEventListener('change', alCambiar);
      el.addEventListener('input', alEscribir);
      window.addEventListener('mv:tema', alTema);
      mqCel.addEventListener('change', alCambiarAncho);
      await cargar(false);
    },
    mostrar(ctx) {
      C = ctx || C;
      Object.keys(charts).forEach(k => { try { charts[k].resize(); } catch (e) {} });
    },
    ocultar() { cerrarPanel(); },
    // Contrato del cascarón 1.8.3: al cerrar sesión o cambiar roles se descarta el div; el próximo montar() empieza de cero.
    desmontar() {
      generacion++; cargando = false;
      cerrarPanel(); destruirGraficos();
      clearTimeout(tBusca); cancelAnimationFrame(rafTema);
      window.removeEventListener('mv:tema', alTema);
      mqCel.removeEventListener('change', alCambiarAncho);
      if (raiz) {
        raiz.removeEventListener('click', alClic); raiz.removeEventListener('change', alCambiar); raiz.removeEventListener('input', alEscribir);
        raiz.innerHTML = '';
      }
      raiz = null; C = null; P = null;
      Object.assign(est, { periodo: null, vista: 'L', unidad: null, q: '', estado: '', unidadF: '', asesor: '', pagina: 0, _vistaLeida: false });
    }
  });
})();
