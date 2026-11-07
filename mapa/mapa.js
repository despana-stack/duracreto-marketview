/* Duracreto MarketView — módulo «Mapa de mercado» (chat Mapa de mercado).
 *
 * Proyectos (Ganado, Perspectiva, Competencia…), plantas propias y de la competencia, radio de 20 km, calor de demanda,
 * clientes de bloques, terrenos y geocercas de asesores. Datos: ctx.api('mapa.cargar') → apps-script/Mapa.gs.
 * Leaflet y sus complementos se cargan aquí bajo demanda (cdnjs, respaldo jsDelivr).
 * «Actualizar» en la ficha de un proyecto abre el módulo Mis proyectos (ctx.abrir('proyectos', {editar: id})).
 * Desde otros módulos: ctx.abrir('mapa', {id: 'PRY-0123'}) abre el mapa en ese proyecto.
 * Todos los id del HTML empiezan con «mapa-» y los estilos van dentro de .mapa-raiz (mapa.css).
 */
(function () {
'use strict';

const LIBS = [
  { css: ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'], js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
    alt: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', altCss: ['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'], listo: () => !!window.L },
  { css: ['https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css'], js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js',
    alt: 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', altCss: ['https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css'], listo: () => !!(window.L && L.markerClusterGroup) },
  { js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js', alt: 'https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js', opcional: true, listo: () => !!(window.L && L.heatLayer) }
];
/* Mapas base sin clave. CARTO pide clave (nov-2026), por eso no se usa. */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/', ESRI2 = 'https://services.arcgisonline.com/ArcGIS/rest/services/';
const OSM = 'https://tile.openstreetmap.org/';
const BASES = [
  { k: 'claro', n: 'Claro', esri: 'Canvas/World_Light_Gray_Base', ref: 'Canvas/World_Light_Gray_Reference', nz: 16, attr: '© Esri, HERE, Garmin, OpenStreetMap' },
  { k: 'calles', n: 'Calles', osm: true, nz: 19, attr: '© OpenStreetMap' },
  { k: 'relieve', n: 'Relieve', esri: 'World_Street_Map', nz: 19, attr: '© Esri, HERE, Garmin, OpenStreetMap' },
  { k: 'satelite', n: 'Satélite', esri: 'World_Imagery', ref: 'Reference/World_Boundaries_and_Places', nz: 19, attr: '© Esri, Maxar, Earthstar Geographics' }
];
const OSCURO = { esri: 'Canvas/World_Dark_Gray_Base', ref: 'Canvas/World_Dark_Gray_Reference', nz: 16, attr: '© Esri, HERE, Garmin, OpenStreetMap' };
/* Miniaturas: un mosaico de San Pedro Sula (z12). */
const miniatura = b => b.osm ? OSM + '12/1046/1869.png' : ESRI + b.esri + '/MapServer/tile/12/1869/1046';
const LIMITES = { todos: [[12.9, -90.2], [16.55, -83.1]], hn: [[12.98, -89.36], [16.52, -83.13]], sv: [[13.14, -90.13], [14.46, -87.68]] };
const ESTADOS = [
  { k: 'ganado', n: 'Ganado' }, { k: 'perspectiva', n: 'Perspectiva' },
  { k: 'competencia', n: 'Competencia' }, { k: 'perdido', n: 'Perdido' }, { k: 'sinestado', n: 'Sin estado' }
];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/* Países vecinos (se atenúan para que Honduras y El Salvador resalten). [lng,lat] */
const MASK_PAISES={"Guatemala":[[-89.3616,14.4155],[-89.3638,14.4466],[-89.3555,14.4754],[-89.323,14.4875],[-89.3049,14.5134],[-89.2909,14.528],[-89.2505,14.5652],[-89.2381,14.5779],[-89.2088,14.5779],[-89.1721,14.5704],[-89.1604,14.5813],[-89.1552,14.6156],[-89.1558,14.6723],[-89.1427,14.6913],[-89.1462,14.7109],[-89.1505,14.7173],[-89.1705,14.7388],[-89.1988,14.7981],[-89.2277,14.8346],[-89.2314,14.8673],[-89.2236,14.879],[-89.1892,14.9131],[-89.1692,14.9521],[-89.1886,14.9961],[-89.1608,15.0602],[-89.1469,15.0713],[-89.1098,15.0915],[-88.9734,15.1404],[-88.7609,15.3],[-88.5874,15.4303],[-88.5,15.4959],[-88.399,15.5728],[-88.3223,15.6673],[-88.2956,15.675],[-88.265,15.6886],[-88.2478,15.6957],[-88.2349,15.7016],[-88.2326,15.7214],[-88.2151,15.7232],[-88.2,15.75],[-88.45,15.84],[-88.6,15.89],[-88.9,15.89],[-89.23,15.89],[-89.23,16.5],[-89.21,17],[-89.16,17.5],[-89.15,17.82],[-90.99,17.25],[-91.44,17.25],[-90.45,16.07],[-91.73,16.07],[-92.19,15.32],[-92.23,14.54],[-92,14.25],[-91.5,14],[-91,13.92],[-90.6,13.93],[-90.11,13.735],[-89.39,14.42],[-89.43,14.43],[-89.5,14.43],[-89.57,14.41],[-89.63,14.37],[-89.68,14.32],[-89.71,14.27],[-89.74,14.21],[-89.78,14.15],[-89.84,14.11],[-89.9,14.08],[-89.96,14.05],[-90,14],[-90.05,13.93],[-90.08,13.87],[-90.1,13.8],[-89.3616,14.4155]],"Nicaragua":[[-87.5989,13.3843],[-87.5618,13.376],[-87.5428,13.372],[-87.5572,13.3659],[-87.5476,13.355],[-87.523,13.359],[-87.482,13.359],[-87.4723,13.367],[-87.4764,13.3797],[-87.4696,13.403],[-87.4473,13.4205],[-87.4298,13.4094],[-87.4098,13.413],[-87.3938,13.4064],[-87.3804,13.3863],[-87.379,13.372],[-87.4111,13.3598],[-87.4404,13.359],[-87.4678,13.3249],[-87.4934,13.3098],[-87.5105,13.2949],[-87.5122,13.2867],[-87.5019,13.2696],[-87.4903,13.2697],[-87.482,13.2659],[-87.4746,13.2492],[-87.4551,13.2243],[-87.4221,13.1499],[-87.4131,13.1114],[-87.3618,13.1133],[-87.3141,13.0954],[-87.3447,13.0908],[-87.3528,13.0725],[-87.3448,13.0573],[-87.3167,13.0342],[-87.2692,13.0294],[-87.2692,13.0232],[-87.2936,13.0111],[-87.3039,12.9885],[-87.314,12.9816],[-87.0698,12.9944],[-87.0469,12.9806],[-87.0296,12.9961],[-86.9832,13.0219],[-86.9484,13.0697],[-86.928,13.0812],[-86.9229,13.0864],[-86.9242,13.0998],[-86.9323,13.1085],[-86.9255,13.1636],[-86.9349,13.1855],[-86.9332,13.1882],[-86.9189,13.2298],[-86.8627,13.2799],[-86.8334,13.2934],[-86.7587,13.2642],[-86.7493,13.2613],[-86.7327,13.2685],[-86.7118,13.2857],[-86.7019,13.3142],[-86.7099,13.3489],[-86.7172,13.3616],[-86.7304,13.3689],[-86.7402,13.3819],[-86.7259,13.4238],[-86.7566,13.5594],[-86.7571,13.5764],[-86.7516,13.6244],[-86.7641,13.6373],[-86.7721,13.6455],[-86.7712,13.7079],[-86.7702,13.7252],[-86.7662,13.7453],[-86.7499,13.7571],[-86.7063,13.77],[-86.5811,13.7799],[-86.5417,13.7821],[-86.4908,13.7595],[-86.4629,13.7709],[-86.4325,13.7571],[-86.4171,13.75],[-86.4101,13.749],[-86.3401,13.7567],[-86.3136,13.7766],[-86.2999,13.8213],[-86.2186,13.9144],[-86.1841,13.9669],[-86.1618,13.9781],[-86.138,13.9962],[-86.1269,14.0186],[-86.1105,14.0371],[-86.0967,14.0441],[-86.0205,14.0441],[-86.0284,13.9961],[-85.9361,13.9182],[-85.9155,13.9074],[-85.9063,13.9094],[-85.8836,13.9139],[-85.8499,13.8871],[-85.8242,13.8477],[-85.7787,13.8409],[-85.7583,13.8393],[-85.7431,13.824],[-85.7403,13.8256],[-85.7251,13.8479],[-85.7287,13.875],[-85.7437,13.8796],[-85.7433,13.9076],[-85.7322,13.9595],[-85.717,13.9627],[-85.6865,13.9673],[-85.6662,13.9845],[-85.6515,13.982],[-85.6504,13.9879],[-85.6446,13.9888],[-85.6128,14.0097],[-85.6031,14.0195],[-85.5717,14.0405],[-85.5466,14.0449],[-85.5186,14.0646],[-85.5106,14.0938],[-85.4747,14.1034],[-85.4317,14.1328],[-85.4091,14.1662],[-85.3936,14.2108],[-85.3725,14.2411],[-85.3629,14.2501],[-85.3478,14.2492],[-85.3408,14.2534],[-85.3309,14.269],[-85.3214,14.2813],[-85.312,14.2837],[-85.2778,14.2973],[-85.2152,14.3016],[-85.1696,14.3218],[-85.158,14.3383],[-85.1719,14.381],[-85.2058,14.4072],[-85.1774,14.434],[-85.1785,14.4556],[-85.1554,14.4795],[-85.1498,14.5365],[-85.1375,14.5785],[-85.1034,14.5569],[-85.0652,14.5543],[-85.0296,14.589],[-85.0222,14.6058],[-85.0422,14.6135],[-85.0485,14.6533],[-85.0382,14.6672],[-85.033,14.6696],[-85.0245,14.7125],[-85.002,14.7407],[-84.9844,14.7522],[-84.9206,14.8077],[-84.9042,14.817],[-84.8181,14.8287],[-84.7702,14.8051],[-84.7586,14.7787],[-84.7669,14.7669],[-84.747,14.7645],[-84.7453,14.7391],[-84.7144,14.7089],[-84.6808,14.6855],[-84.623,14.6672],[-84.6004,14.6625],[-84.5312,14.6533],[-84.519,14.6383],[-84.498,14.6239],[-84.4716,14.6226],[-84.4457,14.6367],[-84.39,14.6715],[-84.3629,14.7156],[-84.346,14.68],[-84.3232,14.6733],[-84.2989,14.668],[-84.2673,14.6777],[-84.2673,14.7467],[-84.2492,14.7594],[-84.2264,14.7498],[-84.2187,14.7434],[-84.1829,14.7139],[-84.1438,14.7219],[-84.1339,14.73],[-84.1196,14.7361],[-84.1112,14.7347],[-84.1023,14.7319],[-84.0954,14.7436],[-84.1111,14.761],[-84.1118,14.7934],[-84.1044,14.7939],[-84.079,14.7752],[-84.0647,14.7703],[-84.0427,14.7681],[-84.0236,14.7583],[-83.9247,14.7634],[-83.9297,14.7809],[-83.9127,14.7972],[-83.8838,14.7771],[-83.8899,14.7907],[-83.8827,14.7878],[-83.8753,14.7843],[-83.8573,14.7878],[-83.8197,14.8036],[-83.809,14.8089],[-83.8139,14.8138],[-83.7653,14.8288],[-83.7466,14.8522],[-83.7236,14.8516],[-83.7124,14.8385],[-83.705,14.8385],[-83.7106,14.8783],[-83.6721,14.8896],[-83.6316,14.8832],[-83.6156,14.8727],[-83.6113,14.8849],[-83.6043,14.9092],[-83.5549,14.9374],[-83.5424,14.9451],[-83.5473,14.9552],[-83.5325,14.951],[-83.5299,14.9618],[-83.523,14.9777],[-83.5126,14.984],[-83.5057,14.9968],[-83.5125,15.0065],[-83.499,15.0127],[-83.4806,15.0055],[-83.4592,14.9825],[-83.4155,14.9969],[-83.3999,15.0136],[-83.3778,15.0213],[-83.3545,15.0101],[-83.3342,15.0064],[-83.273,15.003],[-83.2849,14.9974],[-83.2783,14.9871],[-83.262,14.9832],[-83.1913,14.9943],[-83.1437,14.9949],[-83.1304,14.997],[-83.2,14.7],[-83.35,14.2],[-83.5,13.7],[-83.55,13.2],[-83.65,12.6],[-83.75,12],[-83.7,11.5],[-83.65,11],[-83.7,10.78],[-84.2,10.79],[-84.9,10.94],[-85.35,11.1],[-85.71,11.07],[-86.1,11.55],[-86.55,11.9],[-87,12.35],[-87.35,12.7],[-87.65,12.9],[-87.7,13.15],[-87.5989,13.3843]],"Belice":[[-89.15,17.82],[-88.85,17.89],[-88.3,18.48],[-88.1,18.35],[-88.09,17.9],[-88.2,17.5],[-88.25,17],[-88.3,16.5],[-88.6,16.05],[-89.03,15.9],[-89.23,15.89],[-89.16,17.5],[-89.15,17.82]],"Costa Rica":[[-85.71,11.07],[-85.9,10.9],[-85.65,10.5],[-85.1,9.9],[-84.65,9.65],[-84,9.55],[-83.5,9.3],[-83,8.95],[-82.85,8.3],[-82.6,8.9],[-82.94,9.47],[-83.3,9.9],[-83.7,10.4],[-83.7,10.78],[-84.2,10.79],[-84.9,10.94],[-85.35,11.1],[-85.71,11.07]],"Panamá":[[-82.85,8.3],[-82.4,8.15],[-81.8,7.9],[-81.2,7.6],[-80.6,7.45],[-80,7.35],[-79.5,7.5],[-79,7.8],[-78.2,8.2],[-77.4,8.6],[-77.2,9],[-77.7,9.25],[-78.5,9.4],[-79.3,9.6],[-80,9.4],[-80.8,9.3],[-81.5,9.2],[-82.2,9.4],[-82.94,9.47],[-82.6,8.9],[-82.85,8.3]],"México":[[-92.23,14.54],[-92.9,15.3],[-93.6,15.75],[-94.5,16.2],[-95.2,16.15],[-95.8,16.4],[-96.5,17],[-96.5,18.5],[-96,19.2],[-95.2,18.7],[-94.5,18.2],[-93.5,18.45],[-92.5,18.6],[-91.5,18.65],[-90.7,19.3],[-90.3,20],[-89.6,21.3],[-88,21.6],[-87,21.55],[-86.8,21.2],[-86.75,20.5],[-87.45,20],[-87.6,19],[-87.85,18.2],[-88.1,18.35],[-88.3,18.48],[-88.85,17.89],[-89.15,17.82],[-90.99,17.25],[-91.44,17.25],[-90.45,16.07],[-91.73,16.07],[-92.19,15.32],[-92.23,14.54]]};

/* ---------- utilidades ---------- */
const $ = id => document.getElementById('mapa-' + id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const NF = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 1 }), NF0 = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });
const fmt = n => NF.format(Number(n) || 0), fmt0 = n => NF0.format(Number(n) || 0);
const fmtMes = m => { const x = String(m || '').match(/^(\d{4})-(\d{2})/); return x ? MESES[Number(x[2]) - 1] + ' ' + x[1] : String(m || ''); };
const estadoK = e => { const n = norm(e); if (n === 'ganado') return 'ganado'; if (n === 'perspectiva') return 'perspectiva'; if (n.indexOf('competencia') === 0) return 'competencia'; if (n === 'perdido') return 'perdido'; return 'sinestado'; };
const estadoN = k => (ESTADOS.find(e => e.k === k) || ESTADOS[4]).n;
const esAprox = p => /^s[ií]/i.test(String(p.aprox || ''));
const paisK = p => norm(p) === 'elsalvador' ? 'sv' : 'hn';
const movil = () => matchMedia('(max-width:760px)').matches;
const oscuro = () => !!(CTX && CTX.tema() === 'dark');
const corto = n => String(n || '').replace(/^Duracreto\s*-\s*Planta\s*/i, '').replace(/^Duracreto\s*-\s*/i, '');
const activo = a => /^s[ií]/i.test(String(a.activo || ''));
/* Preferencias de cada persona en ese teléfono o computadora: tipo de mapa, capas encendidas, leyenda y panel oculto.
   Las secciones del panel NO se guardan: al abrir el mapa solo «Plantas» está desplegada.
   v: 2 = desde la 1.3.0 (calor de demanda encendido por defecto; se ignoran las capas guardadas con la versión anterior). */
const PREF = 'mv-mapa-pref', PREF_V = 2;
function guardarPref() { try { localStorage.setItem(PREF, JSON.stringify({ v: PREF_V, capas: S.capas, base: S.base, leyenda: S.leyenda, panelOculto: S.panelOculto })); } catch (e) {} }
function leerPref() { try { const p = JSON.parse(localStorage.getItem(PREF) || 'null'); if (p && p.v !== PREF_V) delete p.capas; return p; } catch (e) { return null; } }
function aviso(m, tipo) { if (CTX) CTX.aviso(m, tipo); }

/* ---------- íconos ---------- */
const IC = {
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  ruta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  mover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  flecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  capas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  bandera: '<svg viewBox="0 0 24 24"><path d="M5 22V3" stroke="#8A8A85" stroke-width="2.2" stroke-linecap="round"/><path d="M6 3.5h11l-2.5 4 2.5 4H6z" fill="#F9D600" stroke="#12130F" stroke-width="1.4" stroke-linejoin="round"/></svg>'
};
/* Glifos de negocio para las plantas (blanco sobre círculo naranja o en color sobre blanco). */
const GLIFO = {
  concreto: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16V8h9v8"/><path d="M11 10h4l3 3v3h-7"/><path d="M4.5 8l3-3 4 1"/><circle cx="6" cy="17.5" r="1.8" fill="#fff"/><circle cx="15.5" cy="17.5" r="1.8" fill="#fff"/></svg>',
  agregados: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M2 19l6.5-10 3.5 5 2.5-3.5L22 19z"/></svg>',
  bloques: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 12h18M9 5v7M15 12v7"/></svg>',
  prefabricados: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M5 5h14M5 19h14M12 5v14"/></svg>',
  cemento: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M6 21V8l3-3h6l3 3v13z"/><path d="M6 12h12M6 16h12"/></svg>'
};
/* Ícono ilustrado del proyecto según su tipo. Va dentro de un círculo blanco cuyo borde lleva el color del estado.
   (La misma tabla está en proyectos/proyectos.js.) */
const SEG_ICO = {
  vertical: '<rect x="4.5" y="3" width="9.5" height="18" rx="1.2" fill="#4F7CB3"/><rect x="14" y="8.5" width="5.5" height="12.5" rx="1" fill="#8EB0D8"/><g fill="#E6F0FB"><rect x="6.5" y="5.5" width="2" height="2"/><rect x="10" y="5.5" width="2" height="2"/><rect x="6.5" y="9.5" width="2" height="2"/><rect x="10" y="9.5" width="2" height="2"/><rect x="6.5" y="13.5" width="2" height="2"/><rect x="10" y="13.5" width="2" height="2"/><rect x="15.8" y="11" width="2" height="1.6"/><rect x="15.8" y="14.3" width="2" height="1.6"/></g><rect x="8.2" y="17.5" width="2.4" height="3.5" fill="#2E4F78"/>',
  casa: '<path d="M2.5 12.5L8.5 7l6 5.5z" fill="#D9542C"/><rect x="4" y="12" width="9" height="8.5" fill="#F4DDB5"/><rect x="7.4" y="15.2" width="2.3" height="5.3" fill="#8B5A3C"/><path d="M12 13.5l4.8-4.3 4.7 4.3z" fill="#E8794E"/><rect x="13" y="13.2" width="7.4" height="7.3" fill="#FBE9CC"/><rect x="15.3" y="15.6" width="2.4" height="2.2" fill="#7FB0D9"/><rect x="2" y="20.3" width="20" height="1.2" rx=".6" fill="#7BA05B"/>',
  industria: '<rect x="15.6" y="3.5" width="2.8" height="9" fill="#6E747D"/><path d="M2.5 21V11.2l5 3.1v-3.1l5 3.1v-3.1l5 3.1V21z" fill="#959CA6"/><g fill="#F9C200"><rect x="5" y="16" width="2.4" height="2.2"/><rect x="10" y="16" width="2.4" height="2.2"/><rect x="15" y="16" width="2.4" height="2.2"/></g><path d="M16.5 3.5c0-1.3 1.8-1.6 2.6-.7" stroke="#B9BEC5" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
  vial: '<path d="M8.8 3h6.4L21 21H3z" fill="#4D535C"/><path d="M12 4.8v2.6M12 10v3M12 15.8v3.6" stroke="#F9C200" stroke-width="1.7" stroke-linecap="round"/><path d="M8.8 3L3 21M15.2 3L21 21" stroke="#E9ECEF" stroke-width="1"/>',
  otro: '<path d="M9.6 3.5h4.8l4 15.5H5.6z" fill="#F07800"/><path d="M8.4 9h7.2M7.1 14h9.8" stroke="#fff" stroke-width="2"/><rect x="3.5" y="18.8" width="17" height="2.4" rx="1.2" fill="#6B6B68"/>'
};
const SEG_N = { vertical: 'Edificación vertical', casa: 'Horizontal / residencial', industria: 'Industrial', vial: 'Infraestructura vial', otro: 'Otro / sin tipo' };
const SEG_CORTO = { vertical: 'Vertical', casa: 'Horizontal', industria: 'Industrial', vial: 'Vial', otro: 'Otro' };
const segK = p => { const n = norm(p.segmento) + ' ' + norm(p.tipo); if (/vertical|torre|edificio|apartament/.test(n)) return 'vertical'; if (/horizontal|residencial|urbaniz|casa|vivienda|condomin/.test(n)) return 'casa'; if (/industrial|bodega|nave|planta/.test(n)) return 'industria'; if (/vial|infraestructura|pavimen|puente|carretera|desnivel/.test(n)) return 'vial'; return 'otro'; };
const icoSeg = (sk, t) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" aria-hidden="true">${SEG_ICO[sk]}</svg>`;
/* Marcador de proyecto (mapa, lista y buscador): el ícono del tipo suelto, con halo blanco, y un punto del color
   del estado en la esquina inferior derecha (hueco = ubicación aproximada). */
function pinSvg(ek, sk, aprox, w) {
  w = w || 28;
  const d = w >= 24 ? 11 : 8;
  return `<span class="mk-s${aprox ? ' ax' : ''}" style="--w:${w}px;--d:${d}px;--c:var(--mapa-${ek})">${icoSeg(sk, w)}<i></i></span>`;
}
/* Grupo de proyectos: ícono del tipo que más se repite (empate: vertical > industria > vial > casa > otro). */
const PRIORIDAD_TIPO = ['vertical', 'industria', 'vial', 'casa', 'otro'];
function tipoDominante(tipos) {
  const cnt = {}; tipos.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
  return PRIORIDAD_TIPO.reduce((mejor, t) => (cnt[t] || 0) > (cnt[mejor] || 0) ? t : mejor, PRIORIDAD_TIPO.find(t => cnt[t]) || 'otro');
}
function grupoSvg(sk, n) {
  const capas = n >= 3 ? 2 : 1;
  return `<span class="cg" data-n="${n}">${capas > 1 ? `<span class="cg-sil s2">${icoSeg(sk, 32)}</span>` : ''}<span class="cg-sil s1">${icoSeg(sk, 32)}</span><span class="cg-ico">${icoSeg(sk, 32)}</span><b>${n}</b></span>`;
}
const COLOR_NEG = { concreto: '#1D5FA8', agregados: '#8A6D1F', bloques: '#C2410C', prefabricados: '#0F766E', cemento: '#5E5E5A' };
const glifo = (k, color) => (GLIFO[k] || GLIFO.concreto).replace(/#fff/g, color);
/* Planta (mapa, panel, buscador y leyenda): glifo del negocio suelto, sin fondo.
   Duracreto = naranja con halo amarillo y contorno blanco; competencia = color de su negocio con contorno blanco. */
const NARANJA_PLANTA = '#F07800';
function plantaSvg(propia, neg, w) {
  const color = propia ? NARANJA_PLANTA : (COLOR_NEG[neg] || '#5E5E5A');
  return `<span class="pl-s ${propia ? 'propia' : 'comp'}" style="--w:${w}px">${glifo(neg || 'concreto', color)}</span>`;
}
const RADIO_KM = 20;
const NEGOCIO_N = { concreto: 'Concreto', agregados: 'Agregados', bloques: 'Bloques', prefabricados: 'Prefabricados', cemento: 'Cemento' };
const PALETA = ['#7B2FFF', '#00B4D8', '#E91E63', '#2DCB75', '#FF6D00', '#0077FF', '#C084FC', '#FF2200', '#F5C400', '#00C060'];
function colorAsesor(a, i) { return /^#[0-9a-f]{3,8}$/i.test(String(a.color || '')) ? a.color : PALETA[i % PALETA.length]; }

/* ---------- estado (se reinicia en cada montar: p. ej. al cerrar sesión y entrar otra persona) ---------- */
let CTX = null, RAIZ = null, S = null, M = null, TIMER = 0, refrescando = null;
function estadoNuevo() {
  const pref = leerPref() || {};
  S = {
    d: null, sucio: false, visible: true, cargado: 0,
    f: { q: '', sel: { pais: new Set(), pl: new Set(), neg: new Set(), tipo: new Set(), estado: new Set() }, asesor: '', zona: '', segmento: '', planta: '', comp: '', mes: '' },
    capas: Object.assign({ proyectos: true, plantas: true, calor: true, geocercas: false, terrenos: false, clientes: false }, pref.capas || {}),
    base: pref.base || '', ui: { mas: false, lista: false, proy: false, plantas: true, extra: false },
    leyenda: pref.leyenda !== undefined ? pref.leyenda : false, panelOculto: !!pref.panelOculto,
    geoVis: {}, editGeo: null, mover: null, vistaInicial: false, pendiente: null
  };
  M = { map: null, base: null, ref: null, cluster: null, plantas: null, radio: null, calor: null, geo: null, ter: null, cli: null, mask: null, edit: null, marcas: {}, plMarcas: {} };
}
const vivo = () => !!(RAIZ && RAIZ.isConnected && S);

/* ---------- servidor ---------- */
async function api(accion, args) { return CTX.api(accion, args); }
function refrescar() {
  if (!vivo() || refrescando) return refrescando || Promise.resolve();
  refrescando = (async () => {
    try { aplicar(await api('mapa.cargar')); }
    catch (e) { console.error(e); }
    finally { refrescando = null; }
  })();
  return refrescando;
}
/* Avisa a Mis proyectos que la base cambió (ubicación corregida, geocerca). */
function avisarCambio() { window.dispatchEvent(new CustomEvent('mv-mapa:cambio', { detail: { origen: 'mapa' } })); }
window.addEventListener('mv-mapa:cambio', e => {
  if (!vivo() || (e.detail && e.detail.origen === 'mapa')) return;
  S.sucio = true;
  if (S.visible && !document.hidden) { S.sucio = false; refrescar(); }
});

/* ---------- librerías del mapa ---------- */
function cargarCss(href) {
  if (document.querySelector('link[href="' + href + '"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}
function cargarJs(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = () => res(); s.onerror = () => { s.remove(); rej(new Error(src)); };
    document.head.appendChild(s);
  });
}
async function cargarLibs() {
  for (const lib of LIBS) {
    if (lib.listo()) { (lib.css || []).forEach(cargarCss); continue; }
    try { (lib.css || []).forEach(cargarCss); await cargarJs(lib.js); }
    catch (e) {
      try { (lib.altCss || []).forEach(cargarCss); await cargarJs(lib.alt); }
      catch (e2) { if (!lib.opcional) throw e2; }
    }
  }
}

/* ---------- datos ---------- */
function aplicar(d, primera) {
  if (!d || !vivo()) return;
  const antes = S.d; S.d = d; S.cargado = Date.now();
  if (antes && antes.mapaBase !== d.mapaBase && !S.base) ponerBase();
  if (!antes || primera) {
    /* Por defecto cada asesor ve solo sus proyectos; MAPA_CFG.verTodo (Diego, Daniel, Jorge) ve todo. */
    S.f.asesor = (!d.verTodo && d.miAsesor) ? d.miAsesor : '';
    d.asesores.forEach(a => { if (S.geoVis[a.nombre] === undefined) S.geoVis[a.nombre] = activo(a); });
  }
  if (M.map) dibujarTodo();
}
function miNombre() { return (S.d && S.d.miAsesor) || (CTX && CTX.usuario.nombre) || ''; }
function puedeEditar(p) { return !!(S.d && S.d.registrar && CTX.usuario.roles && CTX.usuario.roles.proyectos && (S.d.gestiona || norm(p.asesor) === norm(miNombre()))); }

/* ---------- filtros ---------- */
function compN(p) { return String(p.comp || '').trim(); }
function filtrar(ign) {
  const f = S.f, q = norm(f.q), d = S.d; if (!d) return [];
  return d.proyectos.filter(p => {
    if (fuera('pais', paisK(p.pais))) return false;
    if (ign !== 'estado' && fuera('estado', estadoK(p.estado))) return false;
    if (ign !== 'tipo' && fuera('tipo', segK(p))) return false;
    if (f.asesor === '__sin') { if (p.asesor) return false; } else if (f.asesor && norm(p.asesor) !== norm(f.asesor)) return false;
    if (f.zona && p.zona !== f.zona) return false;
    if (f.segmento && p.segmento !== f.segmento) return false;
    if (f.planta && p.planta !== f.planta) return false;
    if (f.comp && norm(compN(p)) !== f.comp) return false;
    if (f.mes && String(p.mes || '') !== f.mes) return false;
    if (ign !== 'q' && q && norm([p.cliente, p.proyecto, p.id, p.ref].join(' ')).indexOf(q) < 0) return false;
    return true;
  });
}
function nFiltros() { const f = S.f, o = f.sel; return [o.pais.size, o.estado.size, o.tipo.size, o.neg.size, o.pl.size, !!f.asesor, !!f.zona, !!f.segmento, !!f.planta, !!f.comp, !!f.mes, !!f.q].filter(Boolean).length; }
/* Grupos de botones (País, Duracreto o competencia, Tipo de planta, Tipo de proyecto, Estado).
   S.f.sel[grupo] = botones seleccionados; vacío = «todos» (se ve todo y los botones quedan neutros).
   Primer toque estando en «todos» → solo ese; los siguientes se suman; tocar uno seleccionado lo quita;
   si no queda ninguno, o quedan todos los del grupo, el grupo vuelve a «todos». */
const fuera = (g, k) => S.f.sel[g].size > 0 && !S.f.sel[g].has(k);
function tocarGrupo(g, k, todas) {
  const sel = S.f.sel[g];
  if (sel.has(k)) sel.delete(k); else sel.add(k);
  if (todas.length && todas.every(x => sel.has(x))) sel.clear();
}
function paisVista() { const o = S.f.sel.pais; return o.size === 1 ? [...o][0] : 'todos'; }
function pill(g, k, contenido) { return `<button type="button" class="pill" data-g="${g}" data-k="${esc(k)}" aria-pressed="${S.f.sel[g].has(k)}">${contenido}</button>`; }
function grupo(g, titulo, botones) {
  const f = S.f.sel[g].size > 0;
  return `<div class="grupo" data-grupo="${g}"><div class="sub-h"><p class="sub">${titulo}</p>${f ? `<button type="button" class="todos" data-todos="${g}" aria-label="Mostrar todos: ${titulo}">Todos</button>` : ''}</div>
    <div class="pills${f ? ' filtrado' : ''}" role="group" aria-label="${titulo}">${botones}</div></div>`;
}
function quitarFiltros() { Object.assign(S.f, { q: '', asesor: '', zona: '', segmento: '', planta: '', comp: '', mes: '' }); Object.values(S.f.sel).forEach(x => x.clear()); }
function opciones(valores, sel, todos) {
  return `<option value="">${esc(todos)}</option>` + valores.map(v => `<option value="${esc(v.v)}"${v.v === sel ? ' selected' : ''}>${esc(v.n)}${v.c != null ? ' (' + v.c + ')' : ''}</option>`).join('');
}
function contar(campo, fn) {
  const m = new Map();
  S.d.proyectos.forEach(p => { const v = fn ? fn(p) : p[campo]; if (!v) return; const k = fn ? norm(v) : v; const x = m.get(k) || { v: fn ? k : v, n: v, c: 0 }; x.c++; m.set(k, x); });
  return [...m.values()].sort((a, b) => String(a.n).localeCompare(String(b.n), 'es'));
}

/* ---------- estructura ---------- */
function esqueleto() {
  RAIZ.innerHTML = `<div class="mapa-raiz${S.panelOculto ? ' panel-oculto' : ''}">
    <button id="mapa-pestana" type="button" aria-controls="mapa-panel"></button>
    <aside id="mapa-panel" aria-label="Filtros y capas">
      <div class="sheet-h"><b>Filtros</b><button class="btn ghost" type="button" data-accion="cerrar-panel">Listo</button></div>
      <div class="scroll" id="mapa-panel-scroll"><div class="mapa-cargando"><span class="mv-giro"></span> Cargando proyectos…</div></div>
    </aside>
    <div id="mapa-lienzo" role="application" aria-label="Mapa de mercado"></div>
    <div id="mapa-leyenda" class="ctl" data-open="false"></div>
    <div id="mapa-banner" class="ctl" hidden></div>
    <button id="mapa-btn-capas" class="ctl" type="button" aria-expanded="false" aria-controls="mapa-capas-pop">${IC.capas}<span>Capas</span></button>
    <div id="mapa-capas-pop" class="ctl" hidden></div>
    <button id="mapa-btn-filtros" class="btn primary" type="button" data-accion="abrir-panel">Filtros <em id="mapa-n-filtros" hidden>0</em></button>
  </div>`;
  eventos();
}

/* ---------- panel ---------- */
function capaFila(k, nombre, icono) {
  return `<label class="capa"><span class="ic">${icono}</span><span>${nombre}</span><span class="sw"><input type="checkbox" data-capa="${k}"${S.capas[k] ? ' checked' : ''}><i></i></span></label>`;
}
function nMas() { const f = S.f, mio = S.d && S.d.miAsesor && norm(f.asesor) === norm(S.d.miAsesor); return [f.asesor && !mio, !!f.zona, !!f.planta, !!f.comp, !!f.mes].filter(Boolean).length; }
function encabezado(k, titulo, extra, capa) {
  return `<div class="bloque-h"><button type="button" data-sec="${k}" aria-expanded="${!!S.ui[k]}"><svg class="fl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>${titulo}${extra ? ` <small>${extra}</small>` : ''}</button>${capa ? `<label class="sw" title="Mostrar u ocultar en el mapa"><input type="checkbox" data-capa="${capa}"${S.capas[capa] ? ' checked' : ''} aria-label="Mostrar ${titulo} en el mapa"><i></i></label>` : ''}</div>`;
}
function plantasVisibles(ignQ) {
  const f = S.f, o = f.sel, q = norm(f.q);
  if (!S.capas.plantas) return [];
  return S.d.plantas.filter(pl => {
    if (pl.lat == null || pl.lng == null || /^no/i.test(String(pl.activa || ''))) return false;
    const propia = /propia/i.test(pl.tipo || '');
    if (fuera('pl', propia ? 'propia' : 'comp')) return false;
    if (fuera('pais', paisK(pl.pais))) return false;
    const negs = pl.negocios || [];
    if (o.neg.size && !negs.some(n => o.neg.has(n))) return false;
    if (!ignQ && q && norm([pl.nombre, pl.empresa, pl.ciudad].join(' ')).indexOf(q) < 0) return false;
    return true;
  });
}
function dibujarPanel() {
  const d = S.d, f = S.f;
  const asesores = contar('asesor');
  d.asesores.filter(activo).forEach(a => { if (!asesores.some(x => norm(x.v) === norm(a.nombre))) asesores.push({ v: a.nombre, n: a.nombre, c: 0 }); });
  asesores.sort((a, b) => a.n.localeCompare(b.n, 'es'));
  const sinAs = d.proyectos.filter(p => !p.asesor).length;
  const meses = contar('mes').sort((a, b) => String(a.v).localeCompare(String(b.v))).map(x => ({ v: x.v, n: fmtMes(x.v), c: x.c }));
  const mio = !!(d.miAsesor && norm(f.asesor) === norm(d.miAsesor)), nm = nMas();
  const negs = Object.keys(NEGOCIO_N).filter(n => d.plantas.some(pl => (pl.negocios || []).indexOf(n) >= 0));
  $('panel-scroll').innerHTML = `
    <div class="sec">
      ${grupo('pais', 'País', pill('pais', 'hn', 'Honduras') + pill('pais', 'sv', 'El Salvador'))}
      <div class="buscar">${IC.buscar}<input type="search" id="mapa-q" placeholder="Buscar cliente, proyecto o planta" value="${esc(f.q)}" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="mapa-sug"><div id="mapa-sug" class="sug" role="listbox" hidden></div></div>
      ${d.miAsesor ? `<div class="seg dos" role="group" aria-label="Qué proyectos ver"><button type="button" data-vista="mios" aria-pressed="${mio}">Mis proyectos</button><button type="button" data-vista="equipo" aria-pressed="${!f.asesor}">Todo el equipo</button></div>` : ''}
    </div>

    <div class="bloque">
      ${encabezado('plantas', 'Plantas', `(${plantasVisibles().length})`, 'plantas')}
      <div class="desp" ${S.ui.plantas ? '' : 'hidden'}>
        ${grupo('pl', 'Duracreto o competencia',
          pill('pl', 'propia', plantaSvg(true, 'concreto', 18) + 'Duracreto') +
          pill('pl', 'comp', plantaSvg(false, 'concreto', 18) + 'Competencia'))}
        ${grupo('neg', 'Tipo de planta', negs.map(n => pill('neg', n, glifo(n, COLOR_NEG[n]) + NEGOCIO_N[n])).join(''))}
        <p class="nota">Pase el mouse (o toque, en el celular) sobre una planta de concreto Duracreto para ver su radio de 20 km.</p>
      </div>
    </div>

    <div class="bloque">
      ${encabezado('proy', 'Proyectos', '', 'proyectos')}
      <div class="desp" ${S.ui.proy ? '' : 'hidden'}>
        <div id="mapa-g-tipo"></div>
        <div id="mapa-g-estado"></div>
        <div id="mapa-resumen"></div>
        <button type="button" class="mas" data-accion="mas" aria-expanded="${S.ui.mas}">Más filtros${nm ? ` <em>${nm}</em>` : ''}${IC.flecha}</button>
        <div class="desp" ${S.ui.mas ? '' : 'hidden'}>
          <div class="fld"><label for="mapa-f-asesor">Asesor</label><select id="mapa-f-asesor" data-f="asesor">${opciones(asesores, f.asesor, 'Todos los asesores')}${sinAs ? `<option value="__sin"${f.asesor === '__sin' ? ' selected' : ''}>Sin asesor asignado (${sinAs})</option>` : ''}</select></div>
          <div class="grid2">
            <div class="fld"><label for="mapa-f-zona">Zona</label><select id="mapa-f-zona" data-f="zona">${opciones(contar('zona'), f.zona, 'Todas')}</select></div>
            <div class="fld"><label for="mapa-f-mes">Inicio</label><select id="mapa-f-mes" data-f="mes">${opciones(meses, f.mes, 'Todos')}</select></div>
          </div>
          <div class="grid2">
            <div class="fld"><label for="mapa-f-planta">Planta</label><select id="mapa-f-planta" data-f="planta">${opciones(contar('planta').map(x => Object.assign(x, { n: corto(x.n) })), f.planta, 'Todas')}</select></div>
            <div class="fld"><label for="mapa-f-comp">Competidor</label><select id="mapa-f-comp" data-f="comp">${opciones(contar('comp', compN), f.comp, 'Todos')}</select></div>
          </div>
        </div>
        <button type="button" class="mas" data-accion="lista" aria-expanded="${S.ui.lista}">Lista de proyectos <span class="num" id="mapa-n-lista" style="color:var(--muted);font-weight:500"></span>${IC.flecha}</button>
        <div class="desp" id="mapa-lista" ${S.ui.lista ? '' : 'hidden'}></div>
      </div>
    </div>

    <div class="bloque">
      ${encabezado('extra', 'Capas adicionales')}
      <div class="desp" ${S.ui.extra ? '' : 'hidden'}>
        <div>
        ${capaFila('calor', 'Calor de demanda (perspectiva)', '<svg viewBox="0 0 24 24"><defs><radialGradient id="mapa-gc"><stop offset="0" stop-color="#D93025"/><stop offset=".5" stop-color="#F07800"/><stop offset="1" stop-color="#F9C200" stop-opacity="0"/></radialGradient></defs><circle cx="12" cy="12" r="11" fill="url(#mapa-gc)"/></svg>')}
        ${capaFila('clientes', 'Clientes de bloques', '<span class="cb"></span>')}
        ${capaFila('terrenos', 'Terrenos en evaluación', IC.bandera)}
        ${capaFila('geocercas', 'Geocercas de asesores', '<svg viewBox="0 0 24 24" fill="#7B2FFF" fill-opacity=".18" stroke="#7B2FFF" stroke-width="2" stroke-dasharray="4 2"><path d="M3 8l6-5 11 4-1 11-10 3-6-6z"/></svg>')}
        <div id="mapa-geo-lista"></div>
        </div>
      </div>
    </div>
    <button type="button" class="btn ghost" data-accion="limpiar"${nFiltros() ? '' : ' hidden'}>Mostrar todo (quitar filtros)</button>
    <p class="leido">Datos de la base al ${esc(d.leido || '')}</p>`;
  dibujarGeoLista(); dibujarResumen();
}
function dibujarCapasPop() {
  const el = $('capas-pop'); if (!el || !S.d) return;
  const bk = baseActual().k;
  el.innerHTML = `<p class="sec-t">Tipo de mapa</p>
    <div class="bases">${BASES.map(b => `<button type="button" class="base" data-base="${b.k}" aria-pressed="${b.k === bk}"><i style="background-image:url('${miniatura(b)}')"></i>${b.n}</button>`).join('')}</div>
    ${oscuro() ? `<p class="nota">En modo oscuro se usa un mapa gris oscuro (salvo satélite).</p>` : ''}`;
}
function dibujarResumen() {
  const vis = filtrar(), o = S.f.sel;
  const vol = vis.reduce((s, p) => s + (Number(p.vol) || 0), 0);
  const porE = {}; filtrar('estado').forEach(p => { const k = estadoK(p.estado); porE[k] = (porE[k] || 0) + 1; });
  const porT = {}; filtrar('tipo').forEach(p => { const k = segK(p); porT[k] = (porT[k] || 0) + 1; });
  const sinUb = vis.filter(p => p.lat == null || p.lng == null).length, aprox = vis.filter(p => esAprox(p)).length;
  // Botones con proyectos (contados sin el filtro de su propio grupo) y los ya seleccionados.
  const pt = $('g-tipo'); if (pt) pt.innerHTML = grupo('tipo', 'Tipo de proyecto', ['vertical', 'casa', 'industria', 'vial', 'otro'].filter(k => porT[k] || o.tipo.has(k)).map(k => pill('tipo', k, `${icoSeg(k, 17)}${SEG_CORTO[k]}<small>${porT[k] || 0}</small>`)).join(''));
  const pe = $('g-estado'); if (pe) pe.innerHTML = grupo('estado', 'Estado', ESTADOS.filter(e => porE[e.k] || o.estado.has(e.k)).map(e => pill('estado', e.k, `<i class="e-${e.k}"></i>${e.n}<small>${porE[e.k] || 0}</small>`)).join(''));
  const el = $('resumen');
  if (el) el.innerHTML = `<div class="kpi-l"><span><b class="num">${fmt0(vis.length)}</b> proyectos</span><span><b class="num">${fmt0(vol)}</b> m³</span></div>
    ${sinUb || aprox ? `<p class="nota" style="margin-top:4px">${aprox ? `${aprox} con ubicación aproximada (punto hueco).` : ''}${sinUb ? ` ${sinUb} sin ubicación en el mapa.` : ''}</p>` : ''}`;
  const n = nFiltros(), nf = $('n-filtros'); if (nf) { nf.textContent = n; nf.hidden = !n; }
  const lim = RAIZ.querySelector('[data-accion="limpiar"]'); if (lim) lim.hidden = !n;
  const nl = $('n-lista'); if (nl) nl.textContent = '(' + vis.filter(p => p.lat != null).length + ')';
  dibujarLista(vis);
}
function dibujarLista(vis) {
  const el = $('lista'); if (!el || el.hidden) return;
  const conUb = vis.filter(p => p.lat != null && p.lng != null).sort((a, b) => (Number(b.vol) || 0) - (Number(a.vol) || 0));
  if (!conUb.length) { el.innerHTML = `<p class="nota">No hay proyectos con estos filtros.</p>`; return; }
  const max = 80;
  el.innerHTML = `<div class="lista">${conUb.slice(0, max).map(p => `<button type="button" class="li" data-proy="${esc(p.id)}">${pinSvg(estadoK(p.estado), segK(p), esAprox(p), 18)}<div><b>${esc(p.proyecto || 'Sin nombre')}</b><small>${esc(p.cliente || '')}${p.asesor ? ' · ' + esc(p.asesor) : ''}</small></div><span class="num">${p.vol ? fmt0(p.vol) + ' m³' : ''}</span></button>`).join('')}</div>
    ${conUb.length > max ? `<p class="nota">Y ${conUb.length - max} más. Use los filtros o el buscador para acotar.</p>` : ''}`;
}
function dibujarGeoLista() {
  const el = $('geo-lista'); if (!el) return;
  if (!S.capas.geocercas) { el.innerHTML = ''; return; }
  const con = S.d.asesores.filter(a => Array.isArray(a.geocerca) && a.geocerca.length >= 3);
  el.innerHTML = `<div class="geo-l">${con.map(a => `<label class="geo-it"><i style="background:${esc(colorAsesor(a, S.d.asesores.indexOf(a)))}"></i><span>${esc(a.nombre)}${activo(a) ? '' : /^no/i.test(String(a.activo || '')) ? ' <em>(ya no está)</em>' : ' <em>(por confirmar)</em>'}</span><span class="sw"><input type="checkbox" data-geo="${esc(a.nombre)}"${S.geoVis[a.nombre] ? ' checked' : ''}><i></i></span></label>`).join('') || `<p class="nota">Aún no hay geocercas.</p>`}
    ${S.d.editarGeocercas ? `<button type="button" class="btn" data-accion="editar-geo" style="margin:6px 0 4px 4px">Editar geocercas</button>` : ''}</div>`;
}

/* ---------- buscador con sugerencias ---------- */
function sugerencias(txt) {
  const el = $('sug'), inp = $('q'); if (!el) return;
  const q = norm(txt);
  if (q.length < 2) { el.hidden = true; el.innerHTML = ''; if (inp) inp.setAttribute('aria-expanded', 'false'); return; }
  const pr = filtrar('q').filter(p => norm([p.cliente, p.proyecto, p.id, p.ref].join(' ')).indexOf(q) >= 0).sort((a, b) => (Number(b.vol) || 0) - (Number(a.vol) || 0));
  const pls = plantasVisibles(true).filter(pl => norm([pl.nombre, pl.empresa, pl.ciudad].join(' ')).indexOf(q) >= 0);
  const total = pr.length + pls.length, items = [];
  if (total > 1) items.push(`<button type="button" class="sg todas" data-sug="todas" role="option">Ver todas las coincidencias<small>(${total})</small></button>`);
  pls.slice(0, 4).forEach(pl => {
    const propia = /propia/i.test(pl.tipo || ''), n = (pl.negocios || [])[0] || 'concreto';
    items.push(`<button type="button" class="sg" data-sug-pl="${esc(pl.id)}" role="option">${plantaSvg(propia, n, propia ? 24 : 22)}<span><b>${esc(pl.nombre)}</b><small>Planta${pl.ciudad ? ' · ' + esc(pl.ciudad) : ''}</small></span></button>`);
  });
  pr.slice(0, 8).forEach(p => items.push(`<button type="button" class="sg" data-sug-p="${esc(p.id)}" role="option">${pinSvg(estadoK(p.estado), segK(p), esAprox(p), 24)}<span><b>${esc(p.proyecto || 'Sin nombre')}</b><small>${esc(p.cliente || '')}${p.asesor ? ' · ' + esc(p.asesor) : ''}</small></span></button>`));
  if (!items.length) items.push(`<p class="nota" style="padding:8px 12px">Sin coincidencias con los filtros actuales.</p>`);
  el.innerHTML = items.join(''); el.hidden = false; if (inp) inp.setAttribute('aria-expanded', 'true');
}
function cerrarSug() { const el = $('sug'); if (el) { el.hidden = true; el.innerHTML = ''; } const inp = $('q'); if (inp) inp.setAttribute('aria-expanded', 'false'); }
function aplicarBusqueda(txt) { S.f.q = txt; cerrarSug(); actualizar(); dibujarCapa('plantas'); }
function cerrarPanel() { const p = $('panel'); if (p) p.classList.remove('abierto'); }
function irAPlanta(id) {
  const m = M.plMarcas && M.plMarcas[id]; if (!m) return;
  if (movil()) cerrarPanel();
  M.map.setView(m.getLatLng(), Math.max(M.map.getZoom(), 14)); m.openPopup();
}

/* ---------- eventos del panel y del menú de capas (delegados en la raíz) ---------- */
function abrirCapas(abrir) {
  const pop = $('capas-pop'); pop.hidden = !abrir; $('btn-capas').setAttribute('aria-expanded', String(abrir));
  if (abrir) { dibujarCapasPop(); if (movil()) cerrarPanel(); }
}
/* Computadora: el panel se oculta hacia la izquierda con la pestaña del borde (en el celular es el panel inferior «Filtros»). */
const IC_PESTANA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
function pintarPestana() {
  const b = $('pestana'); if (!b) return;
  const txt = S.panelOculto ? 'Mostrar filtros y capas' : 'Ocultar filtros y capas';
  b.innerHTML = IC_PESTANA + (S.panelOculto ? '<span>Filtros</span>' : '');
  b.title = txt; b.setAttribute('aria-label', txt); b.setAttribute('aria-expanded', String(!S.panelOculto));
}
function alternarPanel() {
  S.panelOculto = !S.panelOculto; guardarPref();
  RAIZ.querySelector('.mapa-raiz').classList.toggle('panel-oculto', S.panelOculto);
  pintarPestana();
  if (S.panelOculto) cerrarSug();
  // Leaflet necesita recalcular el tamaño cuando el mapa se agranda o se achica.
  setTimeout(() => M.map && M.map.invalidateSize({ pan: false }), 260);
}

function eventos() {
  const raiz = RAIZ.querySelector('.mapa-raiz'), panel = $('panel'), pop = $('capas-pop');
  pintarPestana();
  $('pestana').addEventListener('click', alternarPanel);
  $('btn-capas').addEventListener('click', () => abrirCapas(pop.hidden));
  $('btn-filtros').addEventListener('click', () => { abrirCapas(false); panel.classList.add('abierto'); });
  raiz.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b || !S.d || !(panel.contains(b) || pop.contains(b))) return;
    if (b.dataset.sug === 'todas') { aplicarBusqueda($('q').value); if (movil()) cerrarPanel(); encuadrarFiltrados(); return; }
    if (b.dataset.sugP) { const id = b.dataset.sugP; $('q').value = ''; aplicarBusqueda(''); abrirProyecto(id); return; }
    if (b.dataset.sugPl) { const id = b.dataset.sugPl; $('q').value = ''; aplicarBusqueda(''); irAPlanta(id); return; }
    if (b.dataset.g || b.dataset.todos) {
      const g = b.dataset.g || b.dataset.todos;
      if (b.dataset.todos) S.f.sel[g].clear();
      else tocarGrupo(g, b.dataset.k, [...b.closest('.pills').querySelectorAll('[data-k]')].map(x => x.dataset.k));
      if (g === 'tipo' || g === 'estado') { actualizar(); return; }
      dibujarPanel(); dibujarCapa('plantas');
      if (g === 'pais') { encuadrar(paisVista()); actualizar(); }
      return;
    }
    if (b.dataset.vista) { S.f.asesor = b.dataset.vista === 'mios' ? S.d.miAsesor : ''; dibujarPanel(); actualizar(); encuadrarFiltrados(); return; }
    if (b.dataset.sec) { const k = b.dataset.sec; S.ui[k] = !S.ui[k]; guardarPref(); dibujarPanel(); return; }
    if (b.dataset.base) { S.base = b.dataset.base; guardarPref(); ponerBase(); dibujarCapasPop(); return; }
    if (b.dataset.proy) { abrirProyecto(b.dataset.proy); return; }
    const a = b.dataset.accion;
    if (a === 'mas' || a === 'lista') { S.ui[a] = !S.ui[a]; guardarPref(); dibujarPanel(); return; }
    if (a === 'limpiar') { quitarFiltros(); dibujarPanel(); actualizar(); dibujarCapa('plantas'); encuadrar('todos'); }
    if (a === 'cerrar-panel') cerrarPanel();
    if (a === 'editar-geo') { abrirCapas(false); empezarGeo(); }
  });
  raiz.addEventListener('change', ev => {
    const t = ev.target; if (!S.d || !(panel.contains(t) || pop.contains(t))) return;
    if (t.dataset.f) { S.f[t.dataset.f] = t.value; dibujarPanel(); actualizar(); if (t.dataset.f !== 'mes') encuadrarFiltrados(); return; }
    if (t.dataset.capa) { S.capas[t.dataset.capa] = t.checked; guardarPref(); if (t.dataset.capa === 'geocercas') dibujarGeoLista(); if (t.dataset.capa === 'plantas') dibujarPanel(); dibujarCapa(t.dataset.capa);
      if (t.dataset.capa === 'calor' && t.checked && !L.heatLayer) aviso('La capa de calor no está disponible en este momento.', 'error');
      return; }
    if (t.dataset.geo !== undefined) { S.geoVis[t.dataset.geo] = t.checked; dibujarCapa('geocercas'); }
  });
  let tq;
  panel.addEventListener('input', ev => { if (ev.target.id === 'mapa-q') { const v = ev.target.value; clearTimeout(tq); tq = setTimeout(() => { S.f.q = v; actualizar(); dibujarCapa('plantas'); sugerencias(v); }, 180); } });
  panel.addEventListener('keydown', ev => {
    if (ev.target.id === 'mapa-q') {
      if (ev.key === 'Escape') cerrarSug();
      if (ev.key === 'Enter') { ev.preventDefault(); aplicarBusqueda(ev.target.value); encuadrarFiltrados(); }
      if (ev.key === 'ArrowDown') { const f = $('sug').querySelector('.sg'); if (f) { ev.preventDefault(); f.focus(); } }
      return;
    }
    const b = ev.target.closest && ev.target.closest('.sg'); if (!b) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); (b.nextElementSibling || b).focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); const p = b.previousElementSibling; p ? p.focus() : $('q').focus(); }
    if (ev.key === 'Escape') { cerrarSug(); $('q').focus(); }
  });
  panel.addEventListener('focusin', ev => { if (ev.target.id === 'mapa-q' && ev.target.value) sugerencias(ev.target.value); });
  raiz.addEventListener('pointerdown', ev => { const bb = panel.querySelector('.buscar'); if (bb && !bb.contains(ev.target)) cerrarSug(); });
}

/* ---------- mapa ---------- */
function crearMapa() {
  const map = M.map = L.map('mapa-lienzo', { zoomControl: false, zoomSnap: .25, zoomDelta: .5, wheelPxPerZoomLevel: 90, worldCopyJump: false, minZoom: 5 });
  L.control.zoom({ position: movil() ? 'bottomright' : 'topright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.createPane('mascara'); map.getPane('mascara').style.zIndex = 250; map.getPane('mascara').style.pointerEvents = 'none';
  map.createPane('zonas'); map.getPane('zonas').style.zIndex = 380;
  map.createPane('plantas'); map.getPane('plantas').style.zIndex = 590;
  map.createPane('etiquetas'); map.getPane('etiquetas').style.zIndex = 390; map.getPane('etiquetas').style.pointerEvents = 'none';
  /* Grupos amplios al alejarse y pequeños al acercarse: en la ciudad se ven las figuras sueltas; los que comparten punto se abren al tocarlos. */
  M.cluster = L.markerClusterGroup({ maxClusterRadius: z => z <= 9 ? 85 : z <= 12 ? 70 : z <= 14 ? 55 : 30, disableClusteringAtZoom: 15, showCoverageOnHover: false, spiderfyOnMaxZoom: true, chunkedLoading: false, iconCreateFunction: iconoCluster });
  M.plantas = L.layerGroup(); M.radio = L.layerGroup(); M.geo = L.layerGroup(); M.ter = L.layerGroup(); M.cli = L.layerGroup();
  ponerBase();
  encuadrar('todos', true);
  map.on('click', () => { if (movil()) cerrarPanel(); abrirCapas(false); });
  const zl = () => { map.getContainer().classList.toggle('z-lejos', map.getZoom() < 11); };
  map.on('zoomend', zl); zl();
  M.radio.addTo(map);
}
function capaEsri(ruta, nz, attr, extra) {
  const t = L.tileLayer(ESRI + ruta + '/MapServer/tile/{z}/{y}/{x}', Object.assign({ maxZoom: 20, maxNativeZoom: nz || 16, attribution: attr || '' }, extra || {}));
  let alterno = false; t.on('tileerror', () => { if (!alterno) { alterno = true; t.setUrl(ESRI2 + ruta + '/MapServer/tile/{z}/{y}/{x}'); } });
  return t;
}
function baseActual() {
  const def = String((S.d && S.d.mapaBase) || 'calles').toLowerCase();
  const k = S.base || (BASES.some(b => b.k === def) ? def : 'calles');
  return BASES.find(b => b.k === k) || BASES[1];
}
function ponerBase() {
  if (!M.map) return;
  if (M.base) M.map.removeLayer(M.base);
  if (M.ref) { M.map.removeLayer(M.ref); M.ref = null; }
  let b = baseActual();
  /* En modo oscuro, todo menos satélite usa el gris oscuro con etiquetas. */
  if (oscuro() && b.k !== 'satelite') b = OSCURO;
  M.map.getContainer().classList.toggle('base-oscura', b === OSCURO);
  if (b.osm) M.base = L.tileLayer(OSM + '{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: b.attr, referrerPolicy: 'strict-origin-when-cross-origin' });
  else M.base = capaEsri(b.esri, b.nz, b.attr);
  M.base.addTo(M.map); M.base.bringToBack();
  if (b.ref) { M.ref = capaEsri(b.ref, b.nz, '', Object.assign({ pane: 'etiquetas' }, b.k === 'satelite' ? { opacity: .9 } : {})); M.ref.addTo(M.map); }
  ponerMascara();
}
function ponerMascara() {
  if (!M.map) return;
  if (M.mask) M.map.removeLayer(M.mask);
  const os = oscuro();
  M.mask = L.layerGroup(Object.keys(MASK_PAISES).map(k => L.polygon(MASK_PAISES[k].map(c => [c[1], c[0]]), { pane: 'mascara', stroke: false, fillColor: os ? '#000' : '#D9D7D1', fillOpacity: baseActual().k === 'satelite' ? .35 : (os ? .42 : .5), interactive: false }))).addTo(M.map);
}
function encuadrar(k, sinAnim) { if (!M.map) return; M.map.fitBounds(LIMITES[k] || LIMITES.todos, { padding: [16, 16], animate: !sinAnim }); }
function encuadrarFiltrados() {
  if (!M.map) return;
  const pts = filtrar().filter(p => p.lat != null && p.lng != null).map(p => [p.lat, p.lng]);
  if (pts.length) M.map.fitBounds(L.latLngBounds(pts).pad(.08), { maxZoom: 14, padding: [20, 20] });
}

function dibujarTodo() {
  dibujarPanel(); if (!$('capas-pop').hidden) dibujarCapasPop();
  ['proyectos', 'plantas', 'calor', 'geocercas', 'terrenos', 'clientes'].forEach(dibujarCapa);
  if (!S.vistaInicial) { S.vistaInicial = true; if (S.f.asesor) encuadrarFiltrados(); }
  pintarLeyenda();
}
function actualizar() { dibujarCapa('proyectos'); if (S.capas.calor) dibujarCapa('calor'); dibujarResumen(); }
/* Los proyectos que caen en el mismo punto (ubicaciones aproximadas) se reparten en espiral para que se vean todos. */
function posiciones(lista) {
  const g = {}; lista.forEach(p => { const k = p.lat.toFixed(4) + ',' + p.lng.toFixed(4); (g[k] = g[k] || []).push(p); });
  const pos = {};
  Object.keys(g).forEach(k => {
    const ps = g[k];
    ps.forEach((p, i) => {
      if (ps.length === 1) { pos[p.id] = [p.lat, p.lng]; return; }
      const r = 55 * Math.sqrt(i + .6), a = i * 2.39996;
      pos[p.id] = [p.lat + r * Math.cos(a) / 111320, p.lng + r * Math.sin(a) / (111320 * Math.cos(p.lat * Math.PI / 180))];
    });
  });
  return pos;
}

function dibujarCapa(k) {
  if (!M.map || !S.d) return;
  const map = M.map, d = S.d;
  if (k === 'proyectos') {
    M.cluster.clearLayers(); M.marcas = {};
    if (S.capas.proyectos) {
      const ms = [], lista = filtrar().filter(p => p.lat != null && p.lng != null), pos = posiciones(lista);
      lista.forEach(p => {
        if (S.mover && S.mover.p.id === p.id) return;
        const ek = estadoK(p.estado), sk = segK(p), ax = esAprox(p);
        const icon = L.divIcon({ className: 'mc-sin-fondo', html: pinSvg(ek, sk, ax, 28), iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
        const m = L.marker(pos[p.id], { icon, est: ek, tipo: sk, keyboard: false, title: p.proyecto || '' });
        m.bindPopup(() => fichaProyecto(p), { maxWidth: 320, autoPanPadding: [20, 20] });
        M.marcas[p.id] = m; ms.push(m);
      });
      M.cluster.addLayers(ms);
      if (!map.hasLayer(M.cluster)) map.addLayer(M.cluster);
    } else if (map.hasLayer(M.cluster)) map.removeLayer(M.cluster);
    return;
  }
  if (k === 'plantas') {
    M.plantas.clearLayers(); M.plMarcas = {}; M.radio.clearLayers();
    const selNeg = S.f.sel.neg;
    plantasVisibles().forEach(pl => {
      const propia = /propia/i.test(pl.tipo || '');
      const negs = (pl.negocios || []), prim = negs.find(n => !selNeg.size || selNeg.has(n)) || negs[0] || 'concreto';
      // Sin número de negocios (el número ahora es de proyectos agrupados); los negocios se ven en la ficha.
      const html = plantaSvg(propia, prim, propia ? 30 : 24);
      const m = L.marker([pl.lat, pl.lng], { pane: 'plantas', zIndexOffset: propia ? 900 : 700, icon: L.divIcon({ className: 'mc-sin-fondo', html, iconSize: propia ? [30, 30] : [24, 24], iconAnchor: propia ? [15, 15] : [12, 12], popupAnchor: [0, -14] }) });
      if (propia) m.bindTooltip(esc(corto(pl.nombre).replace(/\s*DURACRETO\s*/i, ' ').replace(/^Planta de\s*/i, '').trim()), { permanent: true, direction: 'bottom', offset: [0, 12], className: 'lbl-planta' });
      else m.bindTooltip(esc(pl.nombre), { direction: 'top', offset: [0, -12], className: 'tt' });
      m.bindPopup(() => fichaPlanta(pl), { maxWidth: 300 });
      /* Radio de 20 km solo al pasar el mouse (o tocar) una planta de concreto Duracreto. */
      if (propia && negs.indexOf('concreto') >= 0) {
        const ver = () => { M.radio.clearLayers(); M.radio.addLayer(L.circle([pl.lat, pl.lng], { radius: RADIO_KM * 1000, color: '#F49A29', weight: 2, dashArray: '7 6', fillColor: '#F9D600', fillOpacity: .08, interactive: false })); };
        const quitar = () => { if (!m.isPopupOpen()) M.radio.clearLayers(); };
        m.on('mouseover', ver); m.on('mouseout', quitar); m.on('popupopen', ver); m.on('popupclose', () => M.radio.clearLayers());
      }
      M.plantas.addLayer(m); M.plMarcas[pl.id] = m;
    });
    if (!map.hasLayer(M.plantas)) map.addLayer(M.plantas);
    const c = $('panel').querySelector("[data-sec='plantas'] small"); if (c) c.textContent = '(' + plantasVisibles().length + ')';
    return;
  }
  if (k === 'calor') {
    if (M.calor) { map.removeLayer(M.calor); M.calor = null; }
    if (!S.capas.calor) return;
    if (!L.heatLayer) return;   // la librería es opcional; si no cargó, el aviso sale solo cuando la persona enciende la capa
    const ps = filtrar().filter(p => estadoK(p.estado) === 'perspectiva' && p.lat != null);
    const vols = ps.map(p => Number(p.vol) || 0).sort((a, b) => a - b), tope = vols[Math.floor(vols.length * .9)] || 1;
    M.calor = L.heatLayer(ps.map(p => [p.lat, p.lng, Math.max(.15, Math.min(1, (Number(p.vol) || 0) / tope))]), { radius: 28, blur: 22, maxZoom: 13, minOpacity: .25, gradient: { .2: '#F9C200', .55: '#F07800', .85: '#D93025' } }).addTo(map);
    return;
  }
  if (k === 'geocercas') {
    M.geo.clearLayers();
    if (S.capas.geocercas) d.asesores.forEach((a, i) => {
      if (!Array.isArray(a.geocerca) || a.geocerca.length < 3 || !S.geoVis[a.nombre]) return;
      if (S.editGeo && S.editGeo.nombre === a.nombre) return;
      const c = colorAsesor(a, i);
      const pg = L.polygon(a.geocerca, { pane: 'zonas', color: c, weight: 2.2, dashArray: '7 4', fillColor: c, fillOpacity: .12 });
      pg.bindTooltip(`<b>${esc(a.nombre)}</b>${a.territorio ? `<br><small>${esc(a.territorio)}</small>` : ''}`, { sticky: true, className: 'tt' });
      M.geo.addLayer(pg);
    });
    S.capas.geocercas ? M.geo.addTo(map) : map.removeLayer(M.geo); return;
  }
  if (k === 'terrenos') {
    M.ter.clearLayers();
    if (S.capas.terrenos) d.terrenos.forEach(t => {
      if (t.lat == null || t.lng == null) return;
      const m = L.marker([t.lat, t.lng], { zIndexOffset: 950, icon: L.divIcon({ className: 'mc-sin-fondo', html: `<div class="ter">${IC.bandera}</div>`, iconSize: [26, 26], iconAnchor: [7, 24], popupAnchor: [6, -20] }) });
      m.bindPopup(() => fichaTerreno(t)); M.ter.addLayer(m);
    });
    S.capas.terrenos ? M.ter.addTo(map) : map.removeLayer(M.ter); return;
  }
  if (k === 'clientes') {
    M.cli.clearLayers();
    if (S.capas.clientes) d.clientes.forEach(c => {
      if (c.lat == null || c.lng == null) return;
      const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'mc-sin-fondo', html: `<div class="cb${estadoK(c.estado) === 'ganado' ? '' : ' persp'}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) });
      m.bindPopup(() => `<div class="ficha"><div class="top"><span class="chip">Cliente de bloques</span></div><h3>${esc(c.cliente)}</h3><dl><dt>Tipo</dt><dd>${esc(c.tipo || '—')}</dd><dt>Estado</dt><dd>${esc(c.estado || '—')}</dd></dl><div class="acc">${botonRuta(c.lat, c.lng)}</div></div>`);
      M.cli.addLayer(m);
    });
    S.capas.clientes ? M.cli.addTo(map) : map.removeLayer(M.cli);
  }
}

/* Ícono de un grupo: el tipo que más se repite, con siluetas apiladas detrás y el número de proyectos. */
function iconoCluster(c) {
  const ms = c.getAllChildMarkers();
  return L.divIcon({ html: grupoSvg(tipoDominante(ms.map(m => m.options.tipo)), ms.length), className: 'mc-sin-fondo mc-grupo', iconSize: [40, 40], iconAnchor: [18, 22] });
}

/* ---------- fichas ---------- */
function botonRuta(lat, lng) { return `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}">${IC.ruta}Cómo llegar</a>`; }
function fichaProyecto(p) {
  const ek = estadoK(p.estado);
  const meses = p.m ? Object.keys(p.m).sort().map(k => `<span>${fmtMes(k)}: ${fmt(p.m[k])}</span>`).join('') : '';
  const filas = [
    ['Segmento', [p.segmento, p.tipo].filter(Boolean).join(' · ')],
    ['Volumen', p.vol ? fmt(p.vol) + ' m³' : ''],
    ['Planta', corto(p.planta)],
    ['Competencia', p.comp],
    ['Asesor', p.asesor || (p.asesorAnt ? `Sin asignar (antes ${p.asesorAnt})` : 'Sin asignar')],
    ['Inicio', [p.mes ? fmtMes(p.mes) : '', p.plazo ? p.plazo + (Number(p.plazo) === 1 ? ' mes' : ' meses') : ''].filter(Boolean).join(' · ')],
    ['Zona', [p.zona, p.pais].filter(Boolean).join(' · ')],
    ['Referencia', p.ref]
  ].filter(f => f[1]);
  const div = document.createElement('div');
  div.className = 'ficha';
  div.innerHTML = `<div class="top"><span class="chip"><i class="e-${ek}"></i>${estadoN(ek)}</span><span class="id">${esc(p.id)}</span></div>
    <h3>${esc(p.proyecto || 'Sin nombre')}</h3><div class="cli">${esc(p.cliente || '')}</div>
    <dl>${filas.map(f => `<dt>${f[0]}</dt><dd>${esc(f[1])}</dd>`).join('')}</dl>
    ${meses ? `<div><div class="lbl" style="margin-bottom:3px">Despacho por mes (m³)</div><div class="meses">${meses}</div></div>` : ''}
    ${esAprox(p) ? `<div class="aviso"><b>Ubicación aproximada.</b> ${esc(String(p.aprox).replace(/^s[ií]\s*[–-]\s*/i, ''))}. Pida al asesor confirmarla.</div>` : ''}
    ${p.notas ? `<p class="nota">${esc(p.notas)}</p>` : ''}
    <div class="acc">${botonRuta(p.lat, p.lng)}${puedeEditar(p) ? `<button type="button" class="btn primary" data-editar="${esc(p.id)}">Actualizar</button>` : ''}${S.d.moverProyectos ? `<button type="button" class="btn" data-mover="${esc(p.id)}">${IC.mover}Corregir ubicación</button>` : ''}</div>`;
  const b = div.querySelector('[data-mover]'); if (b) b.addEventListener('click', () => empezarMover(p));
  const be = div.querySelector('[data-editar]'); if (be) be.addEventListener('click', () => { M.map.closePopup(); CTX.abrir('proyectos', { editar: p.id }); });
  return div;
}
function fichaPlanta(pl) {
  const propia = /propia/i.test(pl.tipo || '');
  return `<div class="ficha"><div class="top"><span class="chip"><i style="background:${propia ? '#F49A29' : '#5E5E5A'}"></i>${propia ? 'Planta Duracreto' : 'Competencia'}</span></div>
    <h3>${esc(pl.nombre)}</h3>${pl.empresa && !propia ? `<div class="cli">${esc(pl.empresa)}</div>` : ''}
    <div class="tags">${(pl.negocios || []).map(n => `<span class="chip">${esc(NEGOCIO_N[n] || n)}</span>`).join('')}</div>
    <dl>${[['Ciudad', [pl.ciudad, pl.pais].filter(Boolean).join(' · ')], ['Mercado', pl.mercado], ['Nota', pl.obs]].filter(f => f[1]).map(f => `<dt>${f[0]}</dt><dd>${esc(f[1])}</dd>`).join('')}</dl>
    ${propia && (pl.negocios || []).indexOf('concreto') >= 0 ? `<p class="nota">Radio de cobertura de concreto: ${RADIO_KM} km.</p>` : ''}
    <div class="acc">${botonRuta(pl.lat, pl.lng)}</div></div>`;
}
function fichaTerreno(t) {
  return `<div class="ficha"><div class="top"><span class="chip">Terreno · ${esc(t.condicion || '')}</span></div><h3>${esc(t.nombre)}</h3>
    <dl>${[['Uso', t.uso], ['Área', t.area ? fmt0(t.area) + ' m²' : ''], ['Precio', t.precio ? 'L ' + fmt0(t.precio) : '']].filter(f => f[1]).map(f => `<dt>${f[0]}</dt><dd>${esc(f[1])}</dd>`).join('')}</dl>
    <div class="acc">${botonRuta(t.lat, t.lng)}</div></div>`;
}
/** Acerca hasta que el proyecto sale de su grupo (zoom 16) y abre la ficha. Si los filtros lo esconden, los quita. */
function abrirProyecto(id) {
  if (!M.map || !S.d) return;
  if (!M.marcas[id]) {
    const p = S.d.proyectos.find(x => x.id === id);
    if (!p) { aviso('No se encontró el proyecto ' + id + '.', 'error'); return; }
    if (p.lat == null || p.lng == null) { aviso('Ese proyecto todavía no tiene ubicación en el mapa.'); return; }
    quitarFiltros(); S.capas.proyectos = true; dibujarPanel(); actualizar();
    if (!M.marcas[id]) return;
  }
  if (movil()) cerrarPanel();
  const ll = M.marcas[id].getLatLng(); let hecho = false;
  const abrir = () => { if (hecho) return; hecho = true; setTimeout(() => { const m2 = M.marcas[id]; if (m2) m2.openPopup(); }, 80); };
  M.map.once('moveend', abrir); setTimeout(abrir, 900);
  M.map.setView(ll, Math.max(M.map.getZoom(), 16));
}

/* ---------- leyenda ---------- */
function pintarLeyenda() {
  const el = $('leyenda'); el.dataset.open = String(!!S.leyenda);
  el.innerHTML = `<button type="button" aria-expanded="${!!S.leyenda}">Leyenda ${IC.flecha}</button><div class="cuerpo">
    <div class="lbl">Ícono = tipo de proyecto</div>
    ${['vertical', 'casa', 'industria', 'vial', 'otro'].map(k => `<div class="lg">${icoSeg(k, 20)}${SEG_N[k]}</div>`).join('')}
    <div class="lg-sep"></div><div class="lbl">Punto = estado</div>
    ${ESTADOS.slice(0, 4).map(e => `<div class="lg"><span class="lg-pt" style="--c:var(--mapa-${e.k})"></span>${e.n}</div>`).join('')}
    <div class="lg"><span class="lg-pt ax" style="--c:var(--muted)"></span>Ubicación aproximada (punto hueco)</div>
    <div class="lg-sep"></div><div class="lbl">Número = proyectos agrupados</div>
    <div class="lg lg-grupo">${grupoSvg('vertical', 12)}<span>Varios proyectos cercanos; toque para acercar</span></div>
    <div class="lg-sep"></div>
    <div class="lbl">Plantas</div>
    <div class="lg">${plantaSvg(true, 'concreto', 22)}Planta Duracreto (ícono naranja con halo)</div>
    <div class="lg lg-comp"><span>${Object.keys(COLOR_NEG).map(k => `<span title="${NEGOCIO_N[k]}">${plantaSvg(false, k, 18)}</span>`).join('')}</span>Competencia (color de su negocio)</div>
    </div>`;
  el.querySelector('button').onclick = () => { S.leyenda = !S.leyenda; guardarPref(); pintarLeyenda(); };
}

/* ---------- corregir ubicación de un proyecto (MAPA_CFG.editoresBase) ---------- */
function banner(html) { const b = $('banner'); if (!html) { b.hidden = true; b.innerHTML = ''; return b; } b.innerHTML = html; b.hidden = false; return b; }
function empezarMover(p) {
  M.map.closePopup();
  if (S.editGeo) terminarGeo();
  const orig = M.marcas[p.id]; if (orig) M.cluster.removeLayer(orig);
  const m = L.marker([p.lat, p.lng], { draggable: true, zIndexOffset: 2000, icon: L.divIcon({ className: 'mc-sin-fondo', html: '<div class="mover-pin"></div>', iconSize: [26, 26], iconAnchor: [13, 30] }) }).addTo(M.map);
  S.mover = { p, m };
  M.map.setView([p.lat, p.lng], Math.max(M.map.getZoom(), 15));
  M.map.on('click', moverAqui);
  const b = banner(`<span><b>${esc(p.proyecto || p.id)}</b>: arrastre el marcador o toque el mapa en la ubicación correcta.</span>
    <button type="button" class="btn primary" id="mapa-mov-ok">Guardar ubicación</button><button type="button" class="btn ghost" id="mapa-mov-no">Cancelar</button>`);
  $('mov-no').onclick = () => terminarMover();
  $('mov-ok').onclick = async ev => {
    const btn = ev.currentTarget, ll = m.getLatLng(); btn.disabled = true; btn.textContent = 'Guardando…';
    try { const r = await api('mapa.moverProyecto', { id: p.id, lat: ll.lat, lng: ll.lng }); terminarMover(); aplicar(r.datos); avisarCambio(); aviso('Ubicación guardada en la base.'); }
    catch (e) { btn.disabled = false; btn.textContent = 'Guardar ubicación'; aviso(e.message || 'No se pudo guardar.', 'error'); }
  };
  return b;
}
function moverAqui(ev) { if (S.mover) S.mover.m.setLatLng(ev.latlng); }
function terminarMover() {
  if (!S.mover) return;
  M.map.off('click', moverAqui); M.map.removeLayer(S.mover.m);
  S.mover = null; banner(''); dibujarCapa('proyectos');
}

/* ---------- editor de geocercas (MAPA_CFG.editoresGeocercas) ---------- */
function empezarGeo(nombre) {
  if (S.mover) terminarMover();
  if (!S.capas.geocercas) { S.capas.geocercas = true; guardarPref(); }
  const lista = S.d.asesores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!lista.length) { aviso('No hay asesores en la pestaña Asesores.', 'error'); return; }
  nombre = nombre || (S.editGeo && S.editGeo.nombre) || (lista.find(a => Array.isArray(a.geocerca)) || lista[0]).nombre;
  const a = lista.find(x => x.nombre === nombre);
  let pts = Array.isArray(a.geocerca) && a.geocerca.length >= 3 ? a.geocerca.map(p => [p[0], p[1]]) : null;
  if (!pts) {
    const b = M.map.getBounds(), c = b.getCenter(), dy = (b.getNorth() - b.getSouth()) * .15, dx = (b.getEast() - b.getWest()) * .15;
    pts = [[c.lat + dy, c.lng - dx], [c.lat + dy, c.lng + dx], [c.lat - dy, c.lng + dx], [c.lat - dy, c.lng - dx]];
  }
  if (S.editGeo) limpiarEdicion();
  S.editGeo = { nombre, pts, color: colorAsesor(a, S.d.asesores.indexOf(a)) };
  S.geoVis[nombre] = true;
  dibujarCapa('geocercas'); dibujarEdicion(); dibujarGeoLista();
  M.map.fitBounds(L.latLngBounds(pts).pad(.25));
  banner(`<select id="mapa-geo-sel" aria-label="Asesor">${lista.map(x => `<option${x.nombre === nombre ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
    <span class="nota" style="max-width:260px">Arrastre los puntos. Toque un punto pequeño para agregar uno; toque un punto grande para quitarlo.</span>
    <button type="button" class="btn primary" id="mapa-geo-ok">Guardar</button><button type="button" class="btn ghost" id="mapa-geo-no">Cerrar</button><button type="button" class="btn ghost danger" id="mapa-geo-del">Borrar</button>`);
  $('geo-sel').onchange = ev => empezarGeo(ev.target.value);
  $('geo-no').onclick = () => terminarGeo();
  $('geo-del').onclick = () => guardarGeo(true);
  $('geo-ok').onclick = () => guardarGeo(false);
}
function limpiarEdicion() { if (M.edit) { M.map.removeLayer(M.edit); M.edit = null; } }
function dibujarEdicion() {
  limpiarEdicion();
  const e = S.editGeo; if (!e) return;
  const g = M.edit = L.layerGroup().addTo(M.map);
  const pg = L.polygon(e.pts, { color: e.color, weight: 2.5, fillColor: e.color, fillOpacity: .18, interactive: false }).addTo(g);
  e.pts.forEach((p, i) => {
    const v = L.marker(p, { draggable: true, zIndexOffset: 3000, icon: L.divIcon({ className: 'mc-sin-fondo', html: '<div class="vx"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(g);
    v.on('drag', ev => { e.pts[i] = [ev.latlng.lat, ev.latlng.lng]; pg.setLatLngs(e.pts); });
    v.on('dragend', dibujarEdicion);
    v.on('click', () => { if (e.pts.length <= 3) { aviso('La geocerca necesita al menos 3 puntos.'); return; } e.pts.splice(i, 1); dibujarEdicion(); });
  });
  e.pts.forEach((p, i) => {
    const q = e.pts[(i + 1) % e.pts.length];
    const mm = L.marker([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], { zIndexOffset: 2900, icon: L.divIcon({ className: 'mc-sin-fondo', html: '<div class="vm"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }) }).addTo(g);
    mm.on('click', () => { e.pts.splice(i + 1, 0, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); dibujarEdicion(); });
  });
}
let borrarPend = null;
function confirmarBorrado(n) {
  if (borrarPend === n) { borrarPend = null; return true; }
  borrarPend = n; aviso('Toque «Borrar» otra vez para borrar la geocerca de ' + n + '.'); setTimeout(() => { borrarPend = null; }, 4000); return false;
}
async function guardarGeo(borrar) {
  const e = S.editGeo; if (!e) return;
  if (borrar && !confirmarBorrado(e.nombre)) return;
  const b = $('geo-ok'); b.disabled = true; b.textContent = 'Guardando…';
  try {
    const r = await api('mapa.guardarGeocerca', { nombre: e.nombre, puntos: borrar ? [] : e.pts.map(p => [p[0], p[1]]) });
    aplicar(r.datos); avisarCambio();
    aviso(borrar ? 'Geocerca borrada.' : 'Geocerca de ' + e.nombre + ' guardada en la base.');
    if (borrar) terminarGeo(); else { const b2 = $('geo-ok'); if (b2) { b2.disabled = false; b2.textContent = 'Guardar'; } }
  } catch (err) { b.disabled = false; b.textContent = 'Guardar'; aviso(err.message || 'No se pudo guardar.', 'error'); }
}
function terminarGeo() { limpiarEdicion(); S.editGeo = null; banner(''); dibujarCapa('geocercas'); dibujarGeoLista(); }

/* ---------- refresco automático y tema ---------- */
const ocupado = () => !!(S && (S.editGeo || S.mover));
document.addEventListener('visibilitychange', () => { if (!document.hidden && vivo() && S.visible && !ocupado()) refrescar(); });
window.addEventListener('mv:tema', () => {
  if (!vivo() || !M.map) return;
  ponerBase(); dibujarCapa('proyectos'); if (!$('capas-pop').hidden) dibujarCapasPop();
});

/* ---------- registro en el cascarón ---------- */
async function abrirPendiente() {
  const id = S.pendiente; if (!id || !M.map) return;
  S.pendiente = null;
  setTimeout(() => abrirProyecto(id), 250);
}
MV.registrar('mapa', {
  relleno: false,
  async montar(el, ctx) {
    CTX = ctx; RAIZ = el; estadoNuevo();
    S.pendiente = (ctx.params && ctx.params.id) || null;
    esqueleto();
    const [datos] = await Promise.all([api('mapa.cargar'), cargarLibs()]);
    if (!vivo()) return;
    crearMapa();
    aplicar(datos, true);
    setTimeout(() => M.map && M.map.invalidateSize(), 60);
    abrirPendiente();
    clearInterval(TIMER);
    TIMER = setInterval(() => { if (vivo() && S.visible && !document.hidden && !ocupado()) refrescar(); }, 300000);
  },
  async mostrar(ctx) {
    CTX = ctx; if (!vivo()) return;
    S.visible = true;
    if (ctx.params && ctx.params.id && /[?&]id=/.test(location.hash)) S.pendiente = ctx.params.id;
    setTimeout(() => M.map && M.map.invalidateSize(), 30);
    if ((S.sucio || Date.now() - S.cargado > 120000) && !ocupado()) { S.sucio = false; await refrescar(); }
    abrirPendiente();
  },
  ocultar() { if (S) { S.visible = false; cerrarSug(); } }
});
})();
