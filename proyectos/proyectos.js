/* Marcador de posición del módulo «Mis proyectos». Lo reemplaza el chat Mapa de mercado (etapa 2 del plan). */
MV.registrar('proyectos', {
  montar(el) {
    MV.pronto(el, { icono: 'proyectos', titulo: 'Sus proyectos, a un toque', texto: 'Aquí podrá registrar y actualizar sus proyectos (cliente, volumen, mes de inicio y estado) desde el celular.' });
  }
});
