/* Marcador de posición del módulo «Dashboard». Lo reemplaza el chat Mapa de mercado (etapa 5 del plan). */
MV.registrar('dashboard', {
  montar(el) {
    MV.pronto(el, { icono: 'dashboard', titulo: 'El buen concreto no se apura', texto: 'El dashboard de facturado real contra presupuesto y perspectivas está fraguando. Diego y su equipo lo tendrán listo lo antes posible.' });
  }
});
