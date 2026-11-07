/* Duracreto MarketView — módulo «Dashboard»: pantalla «en obra» mientras se construye (etapa 5).
 * La hizo el chat Núcleo como marcador animado; el chat Mapa la reemplaza por el dashboard real en la etapa 5.
 * Es un edificio en construcción: cada ventana es una bandeja del dashboard (al fondo, tenue, cómo se verá),
 * con andamios, cinta de peligro, trabajadores, una grúa y una cinta de avisos. Solo HTML/CSS/SVG, sin librerías.
 * Todo va dentro de .dash-raiz (dashboard.css). Respeta «reducir movimiento» del sistema.
 */
(function () {
  'use strict';

  /* ---------- Piezas de dibujo ---------- */
  // Trabajador en silueta: casco amarillo, chaleco naranja. herramienta: martillo | rodillo | taza | nada
  function obrero(herr, cls) {
    const brazo = {
      martillo: '<g class="dash-brazo dash-martilla"><path d="M20 21 L29 15" stroke="var(--dash-cuerpo)" stroke-width="3.2" stroke-linecap="round"/><path d="M28 10 L31 19" stroke="#8B5A2B" stroke-width="2.4" stroke-linecap="round"/><rect x="25.5" y="7.5" width="8" height="4" rx="1" fill="#6F7068"/></g>',
      rodillo: '<g class="dash-brazo dash-rodilla"><path d="M20 21 L28 13" stroke="var(--dash-cuerpo)" stroke-width="3.2" stroke-linecap="round"/><path d="M28 13 L28 5" stroke="#6F7068" stroke-width="1.6"/><rect x="23" y="1" width="10" height="5" rx="2" fill="var(--yellow)"/></g>',
      taza: '<g class="dash-brazo dash-sorbo"><path d="M20 21 L25 15" stroke="var(--dash-cuerpo)" stroke-width="3.2" stroke-linecap="round"/><rect x="23.5" y="10" width="5" height="6" rx="1" fill="#F2F2EE"/><path class="dash-vapor" d="M25 8 q1.5 -2 0 -4 M27 8 q1.5 -2 0 -4" stroke="var(--dash-tenue)" stroke-width="1" fill="none"/></g>',
      nada: '<path d="M20 21 L25 29" stroke="var(--dash-cuerpo)" stroke-width="3.2" stroke-linecap="round"/>'
    }[herr || 'nada'];
    return `<svg class="dash-obrero ${cls || ''}" viewBox="0 0 36 48" aria-hidden="true">
      <circle cx="16" cy="9" r="4.6" fill="var(--dash-cuerpo)"/>
      <path d="M10.5 8.4 a5.6 5.6 0 0 1 11 0 h1.6 v1.4 h-14.2 v-1.4z" fill="var(--yellow)"/>
      <path d="M11 15 h10 l1.5 14 h-13z" fill="var(--orange)"/><path d="M12.5 19 h7 M12.3 23 h7.5" stroke="#F2F2EE" stroke-width="1.1" opacity=".8"/>
      <path d="M12 21 L7 28" stroke="var(--dash-cuerpo)" stroke-width="3.2" stroke-linecap="round"/>${brazo}
      <g class="dash-piernas"><path class="dash-pi" d="M13 29 L11.5 44" stroke="var(--dash-cuerpo)" stroke-width="3.4" stroke-linecap="round"/><path class="dash-pd" d="M19 29 L20.5 44" stroke="var(--dash-cuerpo)" stroke-width="3.4" stroke-linecap="round"/></g>
    </svg>`;
  }
  const cono = '<svg class="dash-cono" viewBox="0 0 20 24" aria-hidden="true"><path d="M8 2 h4 l6 19 h-16z" fill="var(--orange)"/><path d="M6.6 9 h6.8 l1 3.5 h-8.8z M4.8 15 h10.4 l1 3 h-12.4z" fill="#F2F2EE"/><rect x="0" y="21" width="20" height="3" rx="1" fill="var(--orange)"/></svg>';
  const cinta = (txt, cls) => `<div class="dash-cinta ${cls || ''}"><span>${txt}</span></div>`;
  const andamio = '<div class="dash-andamio" aria-hidden="true"><i></i><i></i><i></i></div>';

  // Fondo tenue de cada bandeja: cómo se verá cuando esté lista
  const barras = n => Array.from({ length: n }, (_, i) =>
    `<div class="dash-grupo"><b style="--h:${38 + (i * 23) % 50}%;--d:${(i * 0.37).toFixed(2)}s"></b><b class="p" style="--h:${45 + (i * 17) % 40}%;--d:${(i * 0.37 + 0.15).toFixed(2)}s"></b><b class="q" style="--h:${25 + (i * 29) % 45}%;--d:${(i * 0.37 + 0.3).toFixed(2)}s"></b></div>`).join('');
  const linea = `<svg class="dash-linea" viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true">
      <path class="dash-guia" d="M0 90 H300 M0 60 H300 M0 30 H300"/>
      <path class="dash-trazo b" d="M0 80 C30 74 50 60 80 62 S130 40 160 44 S220 20 250 26 S290 14 300 12"/>
      <path class="dash-trazo" d="M0 92 C30 86 55 78 80 70 S130 64 160 52 S215 46 245 34 S285 30 300 22"/></svg>`;
  const dona = `<svg class="dash-dona" viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--dash-tenue)" stroke-width="5"/>
      <circle class="dash-dona-v" cx="21" cy="21" r="15.9" fill="none" stroke="var(--yellow)" stroke-width="5" stroke-dasharray="72 28" stroke-dashoffset="25"/></svg>`;
  const filas = Array.from({ length: 6 }, (_, i) => `<div class="dash-fila" style="--d:${i * 0.9}s"><span></span><span style="width:${70 - i * 8}%"></span></div>`).join('');

  const AVISOS = [
    'Vertiendo datos. Favor no pisar.',
    'Fraguando indicadores: 28 días (o un poco menos).',
    'Casco obligatorio para ver el forecast.',
    'Se busca un dato perdido de SAP. Recompensa: un café.',
    'Peligro: gráficos trabajando en altura.',
    'Aquí irá el facturado real vs. presupuesto vs. perspectivas.',
    'No apto para impacientes. Sí apto para optimistas.',
    'Obra supervisada por Diego España.'
  ];

  function html() {
    const ticker = AVISOS.map(t => `<span>${t}</span>`).join('<span class="dash-sep">◆</span>');
    return `<div class="dash-raiz">
  <div class="dash-cielo" aria-hidden="true">
    <svg class="dash-grua" viewBox="0 0 420 150">
      <path d="M60 150 V30 M80 150 V30" stroke="var(--yellow)" stroke-width="5"/>
      <path d="M60 150 L80 130 M60 130 L80 110 M60 110 L80 90 M60 90 L80 70 M60 70 L80 50" stroke="var(--yellow)" stroke-width="2.5"/>
      <path d="M20 30 H410 M40 18 H400 M40 18 L20 30 M400 18 L410 30" stroke="var(--yellow)" stroke-width="4"/>
      <path d="M100 30 L118 18 M140 30 L158 18 M180 30 L198 18 M220 30 L238 18 M260 30 L278 18 M300 30 L318 18 M340 30 L358 18" stroke="var(--yellow)" stroke-width="2"/>
      <rect x="0" y="30" width="44" height="22" fill="var(--dash-cuerpo)"/><rect x="58" y="34" width="26" height="18" rx="3" fill="var(--dash-cuerpo)"/>
      <g class="dash-carro"><rect x="-8" y="30" width="16" height="7" fill="var(--dash-cuerpo)"/>
        <g class="dash-cable"><path d="M0 37 V120" stroke="var(--dash-cuerpo)" stroke-width="1.6"/>
          <g class="dash-carga"><path d="M0 120 l-14 12 M0 120 l14 12" stroke="var(--dash-cuerpo)" stroke-width="1.4"/>
            <rect x="-22" y="132" width="44" height="30" rx="3" fill="var(--surface)" stroke="var(--dash-linea)"/>
            <rect x="-15" y="148" width="7" height="10" fill="var(--orange)"/><rect x="-4" y="141" width="7" height="17" fill="var(--yellow)"/><rect x="7" y="137" width="7" height="21" fill="var(--orange)"/></g></g></g>
    </svg>
    <div class="dash-cartel"><b>OBRA:</b> Dashboard comercial<small>Entrega: cuando fragüe</small></div>
  </div>

  <div class="dash-edif">
    ${cinta('EN CONSTRUCCIÓN · EN CONSTRUCCIÓN · EN CONSTRUCCIÓN · EN CONSTRUCCIÓN · EN CONSTRUCCIÓN', 'dash-cinta-1')}
    <section class="dash-v dash-kpi"><h3>Facturado real</h3><p class="dash-cifra">L ▒▒▒.▒ M</p><i class="dash-brillo"></i>${obrero('rodillo', 'dash-pinta')}</section>
    <section class="dash-v dash-kpi"><h3>Presupuesto</h3><p class="dash-cifra">L ▒▒▒.▒ M</p><i class="dash-brillo"></i><div class="dash-x" aria-hidden="true"></div></section>
    <section class="dash-v dash-kpi"><h3>Forecast</h3><p class="dash-cifra">L ▒▒▒.▒ M</p><i class="dash-brillo"></i>${andamio}${obrero('martillo', 'dash-martillo')}<span class="dash-chispa"></span></section>
    <section class="dash-v dash-kpi"><h3>Cumplimiento</h3>${dona}<p class="dash-nota">Se busca: un porcentaje extraviado</p></section>

    <section class="dash-v dash-ancha"><h3>Facturado real vs. presupuesto vs. perspectivas</h3>
      <div class="dash-barras">${barras(12)}</div>
      <div class="dash-leyenda"><span>Real</span><span class="p">Presupuesto</span><span class="q">Perspectivas</span></div>
      ${andamio}${obrero('nada', 'dash-sube')}
      <div class="dash-letrero">Peligro: gráficos en altura</div></section>
    <section class="dash-v dash-alta"><h3>Ranking de asesores</h3><div class="dash-filas">${filas}</div>
      <p class="dash-nota">Colocando bloque por bloque</p></section>

    <section class="dash-v dash-media"><h3>Tendencia mensual</h3>${linea}
      <div class="dash-mixer" aria-hidden="true"><svg viewBox="0 0 120 60"><rect x="70" y="20" width="40" height="26" rx="3" fill="var(--dash-cuerpo)"/><rect x="76" y="24" width="14" height="10" rx="2" fill="var(--surface)"/>
        <g class="dash-tambor"><ellipse cx="40" cy="28" rx="34" ry="17" fill="var(--yellow)"/><path d="M14 20 L66 36 M18 34 L60 18" stroke="var(--orange)" stroke-width="5"/></g>
        <rect x="4" y="44" width="106" height="5" fill="var(--dash-cuerpo)"/><circle cx="24" cy="52" r="6" fill="var(--dash-cuerpo)"/><circle cx="90" cy="52" r="6" fill="var(--dash-cuerpo)"/></svg></div>
      <p class="dash-nota">Vertiendo datos. Favor no pisar.</p></section>
    <section class="dash-v dash-puerta"><div class="dash-marco"><div class="dash-hoja"><span class="dash-manija"></span></div></div>
      <p><b>Entrada principal</b><br>Próximamente</p>${cinta('NO PASAR · NO PASAR · NO PASAR', 'dash-cinta-x')}</section>
    ${cinta('PELIGRO · DATOS FRESCOS · PELIGRO · DATOS FRESCOS · PELIGRO · DATOS FRESCOS', 'dash-cinta-2')}
  </div>

  <div class="dash-suelo" aria-hidden="true">
    ${cono}${cono}
    <div class="dash-paseo">${obrero('nada', 'dash-camina')}<svg class="dash-carretilla" viewBox="0 0 50 30"><path d="M2 8 H34 L28 22 H10z" fill="var(--orange)"/><text x="18" y="18" font-size="10" font-weight="800" fill="var(--ink)" font-family="Poppins,sans-serif">%</text><path d="M34 8 L46 4" stroke="var(--dash-cuerpo)" stroke-width="2.5"/><circle class="dash-rueda" cx="19" cy="25" r="4.5" fill="none" stroke="var(--dash-cuerpo)" stroke-width="2.5"/></svg></div>
    <div class="dash-descanso">${obrero('taza', 'dash-cafe')}<span>En descanso: esperando datos de SAP</span></div>
    ${cono}
  </div>

  <div class="dash-ticker" role="marquee" aria-label="Avisos de la obra"><div class="dash-ticker-in">${ticker}<span class="dash-sep">◆</span>${ticker}<span class="dash-sep">◆</span></div></div>
  <p class="dash-pie">El dashboard (facturado real, presupuesto, forecast y perspectivas) está en construcción. Lo que se ve tenue en cada ventana es solo una maqueta de cómo lucirá.</p>
</div>`;
  }

  MV.registrar('dashboard', {
    relleno: false,
    montar(el) { el.innerHTML = html(); },
    ocultar() {},
    mostrar() {}
  });
})();
