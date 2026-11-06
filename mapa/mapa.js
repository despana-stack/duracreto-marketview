/* Marcador de posición del módulo «Mapa». Lo reemplaza el chat Mapa de mercado (etapa 2 del plan). */
MV.registrar('mapa', {
  montar(el) {
    MV.pronto(el, { icono: 'mapa', titulo: 'El mapa se está mudando a su casa nueva', texto: 'Muy pronto verá aquí el mapa de mercado: proyectos, plantas propias y de la competencia, zonas de demanda y geocercas. Mientras tanto, siga usando el mapa de Google Sites.' });
  }
});
