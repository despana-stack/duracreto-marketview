/* Marcador de posición del módulo «Estudio de precios». Lo reemplaza el chat Estudio de precios (etapa 3 del plan). */
MV.registrar('precios', {
  montar(el) {
    MV.pronto(el, { icono: 'precios', titulo: 'El estudio de precios viene en camino', texto: 'Aquí estarán el comparador, el registro de cotizaciones de la competencia, el historial y el chat de soporte. Mientras tanto, siga usando el Estudio de precios de Google Sites.' });
  }
});
