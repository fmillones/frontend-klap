// Pantalla de selección: modo (test / producción) + medio de pago.
// Al elegir un medio se abre gas.html con el medio y el modo en la URL.

const params = new URLSearchParams(window.location.search);
let modo = params.get('modo') === 'prod' ? 'prod' : 'test';

const botonesModo = document.querySelectorAll('.modo-btn');
const avisoProd = document.getElementById('avisoProd');

function pintarModo() {
  botonesModo.forEach((b) => {
    const activo = b.dataset.modo === modo;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-pressed', String(activo));
  });
  avisoProd.classList.toggle('d-none', modo !== 'prod');
}

botonesModo.forEach((b) => {
  b.addEventListener('click', () => {
    modo = b.dataset.modo;
    pintarModo();
  });
});

document.querySelectorAll('.medio').forEach((card) => {
  card.addEventListener('click', () => {
    window.location.href =
      'gas.html?tienda=' + encodeURIComponent(card.dataset.tienda) + '&modo=' + encodeURIComponent(modo);
  });
});

pintarModo();