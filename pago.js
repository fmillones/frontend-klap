// URL del backend. En local apunta a localhost:3000; en producción, a tu servicio de Render.
const API_URL = 'https://backend-klap.onrender.com';

const cargando = document.getElementById('cargando');
const errorCuenta = document.getElementById('errorCuenta');
const contenido = document.getElementById('contenido');
const generando = document.getElementById('generando');
const pagoSection = document.getElementById('pagoSection');
const pagoMsg = document.getElementById('pagoMsg');
const reintentar = document.getElementById('reintentar');

const params = new URLSearchParams(window.location.search);
const dni = params.get('dni');
const tienda = params.get('tienda');

let cuentaActual = null;

const LOCALES = { CLP: 'es-CL', PEN: 'es-PE' };
const DECIMALES = { CLP: 0, PEN: 2 };

function formatoMoneda(valor, moneda) {
  return valor.toLocaleString(LOCALES[moneda] || 'es-CL', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: DECIMALES[moneda] ?? 0,
    maximumFractionDigits: DECIMALES[moneda] ?? 0
  });
}

// ---------- 1) Cargar el detalle de la cuenta ----------
(async function init() {
  if (!dni || !tienda) { window.location.replace('index.html'); return; }

  try {
    const r = await fetch(`${API_URL}/api/consulta-deuda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, tienda })
    });
    const data = await r.json();

    cargando.classList.add('d-none');
    if (!r.ok) {
      errorCuenta.textContent = data.error || 'No se pudo cargar la cuenta.';
      errorCuenta.classList.remove('d-none');
      return;
    }

    cuentaActual = data;
    document.getElementById('rNombre').textContent = data.nombre;
    document.getElementById('rRut').textContent = data.numeroCliente;
    document.getElementById('rDireccion').textContent = data.direccion;
    document.getElementById('rPeriodo').textContent = data.periodo;
    document.getElementById('rVencimiento').textContent = data.vencimiento;
    document.getElementById('rMonto').textContent = formatoMoneda(data.monto, data.moneda);
    const medio = document.getElementById('rMedio');
    medio.textContent = data.medioPago;
    medio.classList.remove('d-none');
    contenido.classList.remove('d-none');

    iniciarPago();
  } catch (err) {
    cargando.classList.add('d-none');
    errorCuenta.textContent = 'Error de conexión con el servidor.';
    errorCuenta.classList.remove('d-none');
  }
})();

// ---------- 2) Crear el pago y mostrar el formulario ----------
async function iniciarPago() {
  reintentar.classList.add('d-none');
  pagoMsg.textContent = '';
  generando.classList.remove('d-none');
  pagoSection.classList.add('d-none');

  try {
    const [cfgRes, pagoRes] = await Promise.all([
      fetch(`${API_URL}/api/config?tienda=` + encodeURIComponent(tienda)),
      fetch(`${API_URL}/api/crear-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni: cuentaActual.numeroCliente, tienda })
      })
    ]);
    const cfg = await cfgRes.json();
    const pago = await pagoRes.json();

    if (!cfgRes.ok || !pagoRes.ok) {
      throw new Error((pago && pago.error) || (cfg && cfg.error) || 'No se pudo iniciar el pago.');
    }

    await montarFormularioPago(cfg, pago.formToken);
    generando.classList.add('d-none');
  } catch (err) {
    generando.classList.add('d-none');
    pagoMsg.textContent = err.message || 'Error al conectar con el servidor de pago.';
    reintentar.classList.remove('d-none');
  }
}

document.getElementById('btnReintentar').addEventListener('click', () => {
  pagoSection.innerHTML = '';
  if (window.KR && window.KR.removeForms) window.KR.removeForms().catch(() => {});
  iniciarPago();
});

function cargarScript(src, atributos = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    Object.entries(atributos).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

let scriptCargado = null; // la librería se carga una sola vez
function cargarKrypton(cfg) {
  if (scriptCargado) return scriptCargado;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = cfg.themeCss;
  document.head.appendChild(css);

  scriptCargado = cargarScript(cfg.jsUrl, { 'kr-public-key': cfg.publicKey })
    .then(() => cargarScript(cfg.themeJs));

  scriptCargado.catch(() => { scriptCargado = null; });
  return scriptCargado;
}

async function montarFormularioPago(cfg, formToken) {
  // PayZen hace POST al backend (un sitio estático no puede recibirlo)
  const retorno = `${API_URL}/retorno-pago`;

  pagoSection.innerHTML = '<div id="krForm" class="kr-smart-form" kr-card-form-expanded></div>';
  pagoSection.classList.remove('d-none');

  await cargarKrypton(cfg);

  // setFormConfig ya renderiza el formulario; no llamar a KR.renderElements
  await window.KR.setFormConfig({
    'kr-public-key': cfg.publicKey,
    'kr-post-url-success': retorno,
    'kr-post-url-refused': retorno,
    'kr-language': 'es-ES',
    formToken
  });
}