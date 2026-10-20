// URL del backend. En local apunta a localhost:3000; en producción, a tu servicio de Render.
const API_URL = 'https://backend-klap.onrender.com';

const consultaForm = document.getElementById('consultaForm');
const consultaMsg = document.getElementById('consultaMsg');
const btnConsultar = document.getElementById('btnConsultar');
const inputDni = document.getElementById('dni');
const docPanel = document.getElementById('docPanel');
const docTitulo = document.getElementById('docTitulo');
const docLabel = document.getElementById('docLabel');

// Configuración del campo de documento según el país
const PAISES = {
  PE: { label: 'DNI (8 dígitos)', placeholder: '12345678', maxlength: 8, inputmode: 'numeric' },
  CL: { label: 'RUT (xx.xxx.xxx-x)', placeholder: '12.345.678-9', maxlength: 12, inputmode: 'text' }
};

let tiendaActual = null;
let paisActual = null;

// Formato RUT chileno: xx.xxx.xxx-x (el último carácter es el dígito verificador, puede ser K)
function formatearRut(valor) {
  const limpio = valor.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (limpio.length <= 1) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
}

function formatearDocumento(valor) {
  if (paisActual === 'CL') return formatearRut(valor);
  return valor.replace(/\D/g, '').slice(0, 8); // DNI Perú
}

// Elegir un medio de pago
document.querySelectorAll('.medio').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.medio').forEach((c) => c.classList.remove('activo'));
    card.classList.add('activo');

    const cambioPais = paisActual !== card.dataset.pais;
    tiendaActual = card.dataset.tienda;
    paisActual = card.dataset.pais;

    const cfg = PAISES[paisActual];
    docLabel.textContent = cfg.label;
    inputDni.placeholder = cfg.placeholder;
    inputDni.maxLength = cfg.maxlength;
    inputDni.inputMode = cfg.inputmode;
    docTitulo.textContent = 'Pagar con ' + card.querySelector('.nombre').textContent;
    if (cambioPais) inputDni.value = '';
    consultaMsg.textContent = '';

    docPanel.classList.remove('d-none');
    docPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    inputDni.focus({ preventScroll: true });
  });
});

inputDni.addEventListener('input', () => {
  inputDni.value = formatearDocumento(inputDni.value);
});

// Consulta la deuda y, si existe, abre la página de pago
consultaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!tiendaActual) return;

  const dni = formatearDocumento(inputDni.value);
  consultaMsg.textContent = 'Consultando…';
  consultaMsg.className = 'form-text mt-2';
  btnConsultar.disabled = true;

  try {
    const r = await fetch(`${API_URL}/api/consulta-deuda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, tienda: tiendaActual })
    });
    const data = await r.json();

    if (!r.ok) {
      consultaMsg.textContent = data.error;
      consultaMsg.className = 'form-text mt-2 text-danger';
      btnConsultar.disabled = false;
      return;
    }

    window.location.href =
      'pago.html?dni=' + encodeURIComponent(dni) + '&tienda=' + encodeURIComponent(tiendaActual);
  } catch (err) {
    consultaMsg.textContent = 'Error de conexión con el servidor.';
    consultaMsg.className = 'form-text mt-2 text-danger';
    btnConsultar.disabled = false;
  }
});

// Si el usuario vuelve con el botón "atrás", se reactiva el botón
window.addEventListener('pageshow', () => { btnConsultar.disabled = false; });