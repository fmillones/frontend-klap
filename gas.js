// URL del backend en Render
const API_URL = 'https://backend-klap.onrender.com';

// Medios de pago (las claves coinciden con las del backend)
const MEDIOS = {
  transbank_mall: { nombre: 'Transbank (Mall)' },
  transbank_plus: { nombre: 'Transbank (Plus)' },
  klap:           { nombre: 'Klap' },
  pagonxt:        { nombre: 'Pagonxt' }
};

// Medio y modo vienen en la URL: gas.html?tienda=klap&modo=test
const params = new URLSearchParams(window.location.search);
const tienda = params.get('tienda');
const modo = params.get('modo') === 'prod' ? 'prod' : 'test';
const medio = Object.prototype.hasOwnProperty.call(MEDIOS, tienda) ? MEDIOS[tienda] : null;
if (!medio) window.location.replace('index.html');

const consultaForm = document.getElementById('consultaForm');
const consultaMsg = document.getElementById('consultaMsg');
const btnConsultar = document.getElementById('btnConsultar');
const inputDni = document.getElementById('dni');
const docLabel = document.getElementById('docLabel');
const medioChip = document.getElementById('medioChip');
const cambiarMedio = document.getElementById('cambiarMedio');

// ---------- Configuración inicial de la página ----------
docLabel.textContent = 'N° de Cliente (RUT)';
inputDni.placeholder = '12.345.678-9';
inputDni.maxLength = 12;
inputDni.inputMode = 'text';
if (medio) medioChip.textContent = `${medio.nombre} · ${modo === 'prod' ? 'PRODUCCIÓN' : 'TEST'}`;
if (modo === 'prod') medioChip.classList.add('prod');
cambiarMedio.href = `index.html?modo=${modo}`;

// Formato RUT chileno: xx.xxx.xxx-x (el último carácter es el dígito verificador, puede ser K)
function formatearRut(valor) {
  const limpio = valor.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (limpio.length <= 1) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
}

inputDni.addEventListener('input', () => {
  inputDni.value = formatearRut(inputDni.value);
});

// Consulta la deuda y, si existe, abre la página de pago
consultaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!medio) return;

  const dni = formatearRut(inputDni.value.trim());
  consultaMsg.textContent = 'Consultando…';
  consultaMsg.className = 'form-text mt-2';
  btnConsultar.disabled = true;

  try {
    const r = await fetch(`${API_URL}/api/consulta-deuda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, tienda, modo })
    });
    const data = await r.json();

    if (!r.ok) {
      consultaMsg.textContent = data.error;
      consultaMsg.className = 'form-text mt-2 text-danger';
      btnConsultar.disabled = false;
      return;
    }

    window.location.href =
      'pago.html?dni=' + encodeURIComponent(dni) +
      '&tienda=' + encodeURIComponent(tienda) +
      '&modo=' + encodeURIComponent(modo);
  } catch (err) {
    consultaMsg.textContent = 'Error de conexión con el servidor.';
    consultaMsg.className = 'form-text mt-2 text-danger';
    btnConsultar.disabled = false;
  }
});

// Si el usuario vuelve con el botón "atrás", se reactiva el botón
window.addEventListener('pageshow', () => { btnConsultar.disabled = false; });