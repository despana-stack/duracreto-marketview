/* Duracreto MarketView — cascarón de la app (chat Núcleo / Plataforma).
 *
 * Hace: inicio de sesión, sesión guardada en el teléfono, menú de módulos, carga de cada módulo desde su carpeta,
 * conexión con el servidor (MV.api), tema claro/oscuro, instalación en el celular y avisos.
 *
 * CONTRATO DE MÓDULOS (lo que tiene que hacer cada chat en su carpeta):
 *   web/<modulo>/<modulo>.js   (obligatorio)   web/<modulo>/<modulo>.css   (opcional)
 *   El .js llama una sola vez a:
 *     MV.registrar('<modulo>', {
 *       montar(el, ctx) { ... },   // la primera vez que se abre: dibujar dentro de «el» (un div que ocupa toda el área)
 *       mostrar(ctx)   { ... },    // opcional: cada vez que se vuelve al módulo
 *       ocultar()      { ... },    // opcional: al cambiar a otro módulo (el div NO se borra; el estado se conserva)
 *       relleno: true              // opcional: el área lleva márgenes (false para mapas a pantalla completa)
 *     });
 *   ctx = { usuario, rol, modulo, api(accion, args), aviso(texto, tipo), abrir(modulo, params), params, tema(), esCelular() }
 *     ctx.api('mapa.cargar', {...}) → Promise con «data». Si falla, el error trae .codigo ('red'|'permiso'|'servidor'|'accion').
 *   Cambio de tema: window.addEventListener('mv:tema', e => e.detail.tema)  ('light' | 'dark').
 *   Todo lo del módulo va con prefijo propio (.mapa-…, precios…) y sin variables globales sueltas.
 */
(function () {
  'use strict';
  const VERSION = '1.0.0';              // súbala junto con VERSION en sw.js cada vez que publique cambios
  const API_URL = String(window.API_URL || '').trim();
  const DEMO = !API_URL;
  const K = { ses: 'mv_sesion', mod: 'mv_modulo', tema: 'mv_tema', tip: 'mv_tip_instalar' };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ===================== Íconos ===================== */
  const I = {
    mapa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
    proyectos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8.5 3.5V2.5h7v1M8 10l2 2 4-4M8 16h8"/></svg>',
    precios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12.6V4a1 1 0 0 1 1-1h8.6a1 1 0 0 1 .7.3l7.4 7.4a1 1 0 0 1 0 1.4l-8.6 8.6a1 1 0 0 1-1.4 0L3.3 13.3a1 1 0 0 1-.3-.7z"/><circle cx="8" cy="8" r="1.6"/></svg>',
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V11M10 20V5M16 20v-7M21 20H3"/></svg>',
    luna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>',
    instalar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3M10 18.5h4"/></svg>',
    actualizar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    salir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>',
    ojo: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    compartir: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>'
  };

  /* ===================== Módulos ===================== */
  // Orden = orden del menú. «dir» = carpeta en web/. El rol de cada uno lo manda el servidor (columnas de Usuarios).
  const MODULOS = [
    { id: 'mapa', nom: 'Mapa', largo: 'Mapa de mercado', dir: 'mapa' },
    { id: 'proyectos', nom: 'Mis proyectos', largo: 'Mis proyectos', dir: 'proyectos' },
    { id: 'precios', nom: 'Precios', largo: 'Estudio de precios', dir: 'precios' },
    { id: 'dashboard', nom: 'Dashboard', largo: 'Dashboard', dir: 'dashboard' }
  ];
  const MODX = Object.fromEntries(MODULOS.map(m => [m.id, m]));
  const ROLES = { editor: 'Editor', asesor: 'Asesor', visualizador: 'Visualizador', consulta: 'Consulta' };

  let S = store.get(K.ses);             // { token, usuario: {id, nombre, cargo, correo, inicio, roles:{mapa:'editor',…}} }
  if (S && (!S.token || !S.usuario)) S = null;
  const REG = {};                       // definiciones registradas por los módulos
  const EST = {};                       // id → { el, cargado(Promise), montado }
  let actual = null, params = {};

  const misModulos = () => MODULOS.filter(m => S && S.usuario.roles && S.usuario.roles[m.id]);
  const iniciales = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const esCelular = () => !matchMedia('(min-width:1024px)').matches;
  const temaActual = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  /* ===================== Servidor ===================== */
  async function api(accion, args) {
    if (DEMO) return demoApi(accion, args || {});
    const cuerpo = JSON.stringify({ action: accion, token: S && S.token, args: args || {} });
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 60000);
    let r, j;
    try {
      // Sin encabezados: el navegador lo envía como texto simple y Apps Script no necesita permisos especiales (CORS).
      r = await fetch(API_URL, { method: 'POST', body: cuerpo, signal: ctrl.signal, redirect: 'follow' });
      j = await r.json();
    } catch (e) {
      throw falla('red', navigator.onLine === false ? 'Sin internet. Revise la conexión.' : 'No se pudo conectar con el servidor. Intente de nuevo.');
    } finally { clearTimeout(t); }
    if (!j.ok) {
      if (j.error === 'sesion' && accion !== 'nucleo.login') { cerrarLocal(); render(); aviso('Su sesión terminó. Vuelva a iniciar sesión.', 'error'); }
      throw falla(j.error || 'servidor', j.mensaje || 'Ocurrió un error en el servidor.');
    }
    return j.data;
  }
  function falla(codigo, msg) { const e = new Error(msg); e.codigo = codigo; return e; }

  /* Modo de prueba (config.js sin API_URL): no hay servidor; usuario «demo», contraseña «demo». */
  function demoApi(accion, a) {
    return new Promise((ok, mal) => setTimeout(() => {
      const u = { id: 'demo', nombre: 'Usuario de prueba', cargo: 'Modo de prueba', correo: '', inicio: '', roles: { mapa: 'editor', proyectos: 'editor', precios: 'editor', dashboard: 'editor' } };
      if (accion === 'nucleo.login') return a.usuario === 'demo' && a.clave === 'demo' ? ok({ token: 'demo', usuario: u }) : mal(falla('credenciales', 'En modo de prueba use usuario «demo» y contraseña «demo».'));
      if (accion === 'nucleo.sesion') return ok({ usuario: u });
      if (accion === 'nucleo.logout' || accion === 'nucleo.ping') return ok({ pong: true });
      mal(falla('accion', 'Modo de prueba: no hay servidor para «' + accion + '».'));
    }, 350));
  }

  /* ===================== Avisos ===================== */
  let tAviso = 0;
  function aviso(texto, tipo, accion) {
    const el = $('#mv-toast');
    el.className = 'mv-toast' + (tipo === 'error' ? ' error' : '');
    el.innerHTML = '<span>' + esc(texto) + '</span>' + (accion ? '<button type="button">' + esc(accion.texto) + '</button>' : '');
    if (accion) el.querySelector('button').onclick = () => { el.hidden = true; accion.fn(); };
    el.hidden = false;
    clearTimeout(tAviso);
    tAviso = setTimeout(() => { el.hidden = true; }, accion ? 12000 : 4200);
  }

  /* ===================== Inicio de sesión ===================== */
  function vistaLogin(error, escrito) {
    const ult = escrito != null ? escrito : (store.get('mv_ultimo_usuario') || '');
    $('#app').innerHTML = `<main class="mv-login"><form class="mv-login-card" id="mvLogin" novalidate>
      <img class="mv-login-logo" src="icons/${temaActual() === 'dark' ? 'logo-oscuro' : 'logo-claro'}.png" alt="Duracreto">
      <h1>Market<b>View</b></h1>
      <p class="sub">Inteligencia de mercado y ventas</p>
      ${DEMO ? '<div class="mv-demo"><b>Modo de prueba.</b> Falta la dirección del servidor en config.js. Entre con usuario <b>demo</b> y contraseña <b>demo</b>.</div>' : ''}
      ${error ? `<div class="mv-error" role="alert">${esc(error)}</div>` : ''}
      <label class="mv-campo"><span>Usuario o correo</span><input class="mv-input" id="mvU" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(ult)}" placeholder="Ej.: despana" required></label>
      <label class="mv-campo"><span>Contraseña</span><div class="mv-clave"><input class="mv-input" id="mvP" name="password" type="password" autocomplete="current-password" required><button type="button" id="mvVer" aria-label="Mostrar contraseña" title="Mostrar contraseña">${I.ojo}</button></div></label>
      <button class="mv-btn primario ancho" id="mvEntrar" type="submit">Ingresar</button>
      <p class="pie">Use el mismo usuario y contraseña del Estudio de precios.<br>¿Problemas para entrar? Escriba a Diego España.</p>
    </form></main>`;
    const f = $('#mvLogin'), u = $('#mvU'), p = $('#mvP');
    (ult ? p : u).focus();
    $('#mvVer').onclick = () => { const v = p.type === 'password'; p.type = v ? 'text' : 'password'; $('#mvVer').setAttribute('aria-label', v ? 'Ocultar contraseña' : 'Mostrar contraseña'); };
    f.onsubmit = async ev => {
      ev.preventDefault();
      if (!u.value.trim() || !p.value) return vistaLogin('Escriba su usuario y contraseña.', u.value);
      const b = $('#mvEntrar'); b.disabled = true; b.innerHTML = '<span class="mv-giro"></span> Ingresando…';
      try {
        const d = await api('nucleo.login', { usuario: u.value.trim(), clave: p.value, dispositivo: dispositivo() });
        S = { token: d.token, usuario: d.usuario };
        store.set(K.ses, S); store.set('mv_ultimo_usuario', u.value.trim());
        render();
      } catch (e) {
        vistaLogin(e.message, u.value);
      }
    };
  }
  function dispositivo() {
    const ua = navigator.userAgent;
    const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Otro';
    return so + (instalada() ? ' · app' : ' · navegador');
  }
  function cerrarLocal() {
    S = null; store.del(K.ses);
    Object.keys(EST).forEach(k => { try { REG[k] && REG[k].ocultar && REG[k].ocultar(); } catch (e) {} delete EST[k]; });
    actual = null;
  }
  async function cerrarSesion() {
    const tk = S && S.token;
    cerrarLocal();
    render();
    if (tk && !DEMO) fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'nucleo.logout', token: tk }) }).catch(() => {});
  }

  /* ===================== Estructura de la app ===================== */
  function vistaApp() {
    const mods = misModulos();
    if (!mods.length) {
      $('#app').innerHTML = `<main class="mv-login"><div class="mv-login-card" style="text-align:center"><h1>Sin acceso</h1><p class="sub">Su usuario no tiene acceso a ningún módulo de MarketView. Pida acceso a Diego España.</p><button class="mv-btn ancho" id="mvSalir">Cerrar sesión</button></div></main>`;
      $('#mvSalir').onclick = cerrarSesion; return;
    }
    $('#app').innerHTML = `
      <header class="mv-top">
        <a class="mv-marca" href="#${mods[0].id}" aria-label="Inicio de MarketView"><img src="icons/icon-192.png" alt=""><div><small>MarketView</small><b id="mvTit"></b></div></a>
        <div class="mv-top-acc"><button class="mv-yo" id="mvYo" aria-label="Menú de ${esc(S.usuario.nombre)}" aria-haspopup="true">${esc(iniciales(S.usuario.nombre))}</button></div>
      </header>
      <nav class="mv-nav" id="mvNav" aria-label="Módulos" ${mods.length < 2 ? 'data-uno' : ''}>
        ${mods.map(m => `<button data-mod="${m.id}"><span class="ic">${I[m.id] || I.mapa}</span><em>${esc(esCelular() ? m.nom : m.largo)}</em></button>`).join('')}
        <div class="mv-nav-pie">Duracreto MarketView · v${VERSION}</div>
      </nav>
      <main id="mv-main" class="${mods.length < 2 && esCelular() ? 'sin-nav' : ''}"></main>`;
    if (mods.length < 2 && esCelular()) $('#mvNav').hidden = true;
    $('#mvNav').onclick = e => { const b = e.target.closest('[data-mod]'); if (b) irA(b.dataset.mod); };
    $('#mvYo').onclick = abrirMenu;
    abrir(modDesdeHash() || store.get(K.mod) || mods[0].id);
    sugerirInstalar();
  }

  function modDesdeHash() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const [id, q] = h.split('?');
    if (!MODX[id]) return null;
    params = Object.fromEntries(new URLSearchParams(q || ''));
    return id;
  }
  function irA(id, p) {
    const q = p && Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    if (location.hash === '#' + id + q) abrir(id); else location.hash = id + q;
  }
  window.addEventListener('hashchange', () => { if (S) { const id = modDesdeHash(); if (id) abrir(id); } });

  async function abrir(id) {
    const mods = misModulos();
    if (!mods.some(m => m.id === id)) id = mods[0].id;
    const m = MODX[id];
    if (location.hash.replace(/^#/, '').split('?')[0] !== id) history.replaceState(null, '', '#' + id);
    store.set(K.mod, id);
    document.title = m.largo + ' · MarketView';
    const tit = $('#mvTit'); if (tit) tit.textContent = m.largo;
    document.querySelectorAll('#mvNav [data-mod]').forEach(b => { if (b.dataset.mod === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });

    if (actual && actual !== id && EST[actual]) {
      EST[actual].el.hidden = true;
      try { REG[actual] && REG[actual].ocultar && REG[actual].ocultar(); } catch (e) { console.error(e); }
    }
    actual = id;
    const main = $('#mv-main');
    if (!main) return;
    let st = EST[id];
    if (!st || !main.contains(st.el)) {
      const el = document.createElement('section');
      el.className = 'mv-mod'; el.id = 'mod-' + id; el.setAttribute('aria-label', m.largo);
      el.innerHTML = '<div class="mv-pronto"><span class="mv-giro" style="width:28px;height:28px;color:var(--accent)"></span></div>';
      main.appendChild(el);
      st = EST[id] = { el: el, montado: false };
    }
    st.el.hidden = false;
    try {
      await cargarModulo(m);
      if (actual !== id) return;
      const def = REG[id], ctx = contexto(id);
      st.el.classList.toggle('relleno', def.relleno !== false);
      if (!st.montado) { st.el.innerHTML = ''; st.montado = true; await def.montar(st.el, ctx); }
      else if (def.mostrar) await def.mostrar(ctx);
    } catch (e) {
      console.error(e);
      st.montado = false;
      st.el.classList.add('relleno');
      st.el.innerHTML = `<div class="mv-pronto"><div class="ic">${I[id] || I.mapa}</div><h2>No se pudo abrir ${esc(m.largo)}</h2><p>${esc(e.codigo === 'red' ? e.message : 'Revise su conexión e intente de nuevo.')}</p><button class="mv-btn primario" id="mvReint">Intentar de nuevo</button></div>`;
      $('#mvReint', st.el).onclick = () => { delete CARGAS[m.id]; abrir(id); };
    }
  }

  const CARGAS = {};
  function cargarModulo(m) {
    if (REG[m.id]) return Promise.resolve();
    if (CARGAS[m.id]) return CARGAS[m.id];
    const base = m.dir + '/' + m.dir;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = base + '.css?v=' + VERSION; css.onerror = () => css.remove(); // el .css es opcional
    document.head.appendChild(css);
    return (CARGAS[m.id] = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = base + '.js?v=' + VERSION; s.async = true;
      s.onload = () => REG[m.id] ? ok() : mal(falla('modulo', 'El módulo ' + m.id + ' no se registró.'));
      s.onerror = () => { s.remove(); delete CARGAS[m.id]; mal(falla('red', 'No se pudo descargar el módulo. Revise la conexión.')); };
      document.body.appendChild(s);
    }));
  }

  function contexto(id) {
    return {
      usuario: S.usuario, rol: S.usuario.roles[id], modulo: id, params: Object.assign({}, params),
      api: api, aviso: aviso, abrir: irA, tema: temaActual, esCelular: esCelular, version: VERSION, demo: DEMO
    };
  }

  /* ===================== Menú de usuario ===================== */
  function abrirMenu() {
    cerrarMenu();
    const u = S.usuario, dark = temaActual() === 'dark';
    const roles = MODULOS.filter(m => u.roles[m.id]).map(m => `<span class="mv-rol">${esc(m.largo)}: <b>${esc(ROLES[u.roles[m.id]] || u.roles[m.id])}</b></span>`).join('');
    const capa = document.createElement('div'); capa.className = 'mv-capa'; capa.id = 'mvCapa';
    const menu = document.createElement('div'); menu.className = 'mv-menu'; menu.id = 'mvMenu'; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Menú de usuario');
    menu.innerHTML = `<div class="mv-menu-h"><span class="mv-yo">${esc(iniciales(u.nombre))}</span><div><b>${esc(u.nombre)}</b><small>${esc(u.cargo || u.id)}</small></div></div>
      <div class="mv-roles">${roles}</div>
      <button class="mv-mi" id="mvTema" role="switch" aria-checked="${dark}">${I.luna}<span>Modo oscuro</span><span class="mv-sw ${dark ? 'on' : ''}" aria-hidden="true"></span></button>
      ${instalada() ? '' : `<button class="mv-mi" id="mvInst">${I.instalar}<span>Instalar en el celular</span></button>`}
      <button class="mv-mi" id="mvAct">${I.actualizar}<span>Buscar actualizaciones</span></button>
      <button class="mv-mi peligro" id="mvSal">${I.salir}<span>Cerrar sesión</span></button>
      <div class="mv-ver">Duracreto MarketView · versión ${VERSION}${DEMO ? ' · modo de prueba' : ''}</div>`;
    document.body.append(capa, menu);
    capa.onclick = cerrarMenu;
    $('#mvTema').onclick = () => { cambiarTema(); abrirMenu(); };
    if ($('#mvInst')) $('#mvInst').onclick = () => { cerrarMenu(); instalar(); };
    $('#mvAct').onclick = actualizarApp;
    $('#mvSal').onclick = () => { cerrarMenu(); cerrarSesion(); };
    document.addEventListener('keydown', escMenu);
    $('#mvTema').focus();
  }
  function escMenu(e) { if (e.key === 'Escape') cerrarMenu(); }
  function cerrarMenu() { ['#mvCapa', '#mvMenu', '#mvModal'].forEach(s => { const x = $(s); if (x) x.remove(); }); document.removeEventListener('keydown', escMenu); }

  function cambiarTema() {
    const n = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem(K.tema, n); } catch (e) {}
    window.dispatchEvent(new CustomEvent('mv:tema', { detail: { tema: n } }));
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) window.dispatchEvent(new CustomEvent('mv:tema', { detail: { tema: temaActual() } })); });

  async function actualizarApp() {
    cerrarMenu(); aviso('Buscando actualizaciones…');
    try { const r = await navigator.serviceWorker?.getRegistration(); if (r) await r.update(); } catch (e) {}
    setTimeout(() => location.reload(), 600);
  }

  /* ===================== Instalación en el celular ===================== */
  let promptInstalar = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; });
  window.addEventListener('appinstalled', () => { promptInstalar = null; aviso('MarketView quedó instalada en su celular.'); });
  const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  async function instalar() {
    if (promptInstalar) { promptInstalar.prompt(); try { await promptInstalar.userChoice; } catch (e) {} promptInstalar = null; return; }
    const capa = document.createElement('div'); capa.className = 'mv-capa'; capa.id = 'mvCapa';
    const md = document.createElement('div'); md.className = 'mv-modal'; md.id = 'mvModal'; md.setAttribute('role', 'dialog');
    md.innerHTML = esIOS()
      ? `<h2>Instalar en iPhone</h2><ol><li>Abra esta página en <b>Safari</b>.</li><li>Toque <b>Compartir</b> ${I.compartir} (abajo).</li><li>Elija <b>Agregar a pantalla de inicio</b> y toque <b>Agregar</b>.</li></ol><button class="mv-btn primario ancho" id="mvOk">Entendido</button>`
      : `<h2>Instalar en Android</h2><ol><li>Abra esta página en <b>Chrome</b>.</li><li>Toque el menú <b>⋮</b> (arriba a la derecha).</li><li>Elija <b>Instalar aplicación</b> (o <i>Agregar a la pantalla principal</i>).</li></ol><button class="mv-btn primario ancho" id="mvOk">Entendido</button>`;
    document.body.append(capa, md);
    capa.onclick = cerrarMenu; $('#mvOk').onclick = cerrarMenu; $('#mvOk').focus();
  }
  function sugerirInstalar() {
    if (instalada() || !esCelular() || store.get(K.tip) || $('#mvTip')) return;
    setTimeout(() => {
      if (!S || instalada() || $('#mvTip')) return;
      const t = document.createElement('div'); t.className = 'mv-tip'; t.id = 'mvTip';
      t.innerHTML = `<img src="icons/icon-192.png" alt=""><div><b>Instale MarketView</b><br>Ábrala como una app desde su pantalla de inicio.</div><button class="mv-btn primario" id="mvTipSi" style="height:36px;padding:0 12px">Instalar</button><button class="x" id="mvTipNo" aria-label="Cerrar">×</button>`;
      document.body.appendChild(t);
      const fuera = () => { t.remove(); store.set(K.tip, Date.now()); };
      $('#mvTipSi').onclick = () => { fuera(); instalar(); };
      $('#mvTipNo').onclick = fuera;
    }, 2500);
  }

  /* ===================== Arranque ===================== */
  function render() { cerrarMenu(); if (!S) vistaLogin(); else vistaApp(); }

  // API pública para los módulos
  window.MV = {
    version: VERSION, demo: DEMO,
    registrar(id, def) {
      if (!MODX[id]) { console.error('MarketView: módulo desconocido «' + id + '»'); return; }
      if (!def || typeof def.montar !== 'function') { console.error('MarketView: el módulo «' + id + '» no tiene montar(el, ctx)'); return; }
      REG[id] = def;
    },
    api: api, aviso: aviso, abrir: irA, escapar: esc, icono: id => I[id] || '',
    /** Pantalla «Pronto» para módulos en construcción (la usan los marcadores de posición). */
    pronto(el, o) {
      el.innerHTML = `<div class="mv-pronto"><div class="ic">${I[o.icono] || I.mapa}</div><span class="etq">${esc(o.etiqueta || 'En construcción')}</span><h2>${esc(o.titulo)}</h2><p>${esc(o.texto)}</p><button class="mv-btn" data-ping>Probar conexión con el servidor</button></div>`;
      el.querySelector('[data-ping]').onclick = async ev => {
        const b = ev.currentTarget; b.disabled = true;
        try { await api('nucleo.ping'); aviso(DEMO ? 'Modo de prueba: todavía no hay servidor configurado.' : 'Conexión correcta con el servidor.'); }
        catch (e) { aviso(e.message, 'error'); } finally { b.disabled = false; }
      };
    },
    usuario: () => (S ? S.usuario : null), tema: temaActual
  };

  render();
  // Refresca nombre y roles con el servidor sin hacer esperar (si cambiaron en la Hoja, se aplican aquí).
  if (S) api('nucleo.sesion').then(d => {
    if (!S || !d || !d.usuario) return;
    const antes = JSON.stringify(S.usuario.roles);
    S.usuario = d.usuario; store.set(K.ses, S);
    if (JSON.stringify(d.usuario.roles) !== antes) render();
  }).catch(() => {});

  // Service worker: instalación y apertura rápida. Avisa cuando hay una versión nueva.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      const yaHabia = !!navigator.serviceWorker.controller; // la primera visita no es «versión nueva»
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'activated' && yaHabia) aviso('Hay una versión nueva de MarketView.', '', { texto: 'Actualizar', fn: () => location.reload() });
          });
        });
      }).catch(() => {});
    });
  }
  let anchoCel = esCelular();
  window.addEventListener('resize', () => { if (S && esCelular() !== anchoCel) { anchoCel = esCelular(); vistaAppKeep(); } });
  function vistaAppKeep() {
    // Cambió entre celular y computadora: solo se ajustan los textos del menú (los módulos no se vuelven a montar).
    document.querySelectorAll('#mvNav [data-mod]').forEach(b => { const m = MODX[b.dataset.mod]; b.querySelector('em').textContent = esCelular() ? m.nom : m.largo; });
    const nav = $('#mvNav'), main = $('#mv-main');
    if (nav && main) { const uno = misModulos().length < 2; nav.hidden = uno && esCelular(); main.classList.toggle('sin-nav', uno && esCelular()); }
  }
})();
