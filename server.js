// server.js
const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/turnos', express.static(path.join(__dirname, 'turnos')));

const CLIENTES_DIR = path.join(__dirname, 'clientes');
const TURNOS_DIR = path.join(__dirname, 'turnos');
if (!fs.existsSync(TURNOS_DIR)) fs.mkdirSync(TURNOS_DIR);

function cargarConfig(clienteId) {
  const file = path.join(CLIENTES_DIR, clienteId, 'config.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function cargarTurnos(clienteId) {
  const file = path.join(TURNOS_DIR, `${clienteId}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function guardarTurno(clienteId, nuevoTurno) {
  const turnos = cargarTurnos(clienteId);
  turnos.push(nuevoTurno);
  fs.writeFileSync(path.join(TURNOS_DIR, `${clienteId}.json`), JSON.stringify(turnos, null, 2));
}

function estaDisponible(clienteId, fecha, hora, correo) {
  const turnos = cargarTurnos(clienteId);
  const mismosDia = turnos.filter(t => t.correo === correo && t.fecha === fecha);
  return mismosDia.length < 2 && !turnos.some(t => t.fecha === fecha && t.hora === hora);
}


function estaEnHorarioPermitido(config, fecha, hora) {
  if (!config.dias || !Array.isArray(config.dias)) return false;
  
  const dia = new Date(`${fecha}T${hora}`).getDay();
  const horaInt = parseInt(hora.split(':')[0]);

  if (!config.dias.includes(dia)) return false;

  const horarioDia = config.horarios[String(dia)];
  if (!horarioDia) return false;

  return horaInt >= horarioDia.inicio && horaInt < horarioDia.fin;
}


// Nueva ruta para API de configuración
app.get('/api/config/:clienteId', (req, res) => {
  const config = cargarConfig(req.params.clienteId);
  if (!config) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
  res.json(config);
});

app.get('/:clienteId', (req, res) => {
  const clienteId = req.params.clienteId;
  const config = cargarConfig(clienteId);
  if (!config) return res.status(404).send('Cliente no encontrado');

  const formPath = path.join(__dirname, 'public', 'form.html');
  if (!fs.existsSync(formPath)) return res.status(500).send('Formulario no disponible');

  let html = fs.readFileSync(formPath, 'utf8');

  const cssHref = fs.existsSync(path.join(__dirname, 'public', 'clientes', clienteId, 'style.css'))
    ? `<link rel="stylesheet" href="/clientes/${clienteId}/style.css">`
    : `<link rel="stylesheet" href="/default.css">`;

  const logoPath = path.join(__dirname, 'public', 'clientes', clienteId, 'logo.png');
  const logoHtml = fs.existsSync(logoPath)
    ? `<img src="/clientes/${clienteId}/logo.png?v=${Date.now()}" alt="${config.nombre}" style="height:70px;">`
    : '';

  html = html.replace('<!-- CLIENTE_STYLE -->', cssHref);
  html = html.replace('<!-- CLIENTE_LOGO -->', logoHtml);
  html = html.replace('<!-- CLIENTE_NOMBRE -->', `<p class="nombre-cliente">${config.nombre}</p>`);

  res.send(html);
});

app.get('/:clienteId/panel', (req, res) => {
  const { clienteId } = req.params;
  const { clave } = req.query;
  if (clave !== '1234') return res.status(401).send('No autorizado');

  const turnos = cargarTurnos(clienteId);
  const cssPath = fs.existsSync(path.join(__dirname, 'public', 'clientes', clienteId, 'style.css'))
    ? `/clientes/${clienteId}/style.css`
    : '/default.css';

  let tabla = `
    <section><h1>Turnos de ${clienteId}</h1>
    <input type="text" id="filtroNombre" placeholder="Filtrar por nombre...">
    <input type="date" id="filtroFecha">
    <button onclick="aplicarFiltros()">Filtrar</button>
    <button onclick="resetearFiltros()">Limpiar</button>
    <div><table><thead>
    <tr><th>Nombre</th><th>Correo</th><th>WhatsApp</th><th>Fecha</th><th>Hora</th></tr>
    </thead><tbody>
  `;

  turnos.forEach(t => {
    tabla += `<tr><td>${t.nombre}</td><td>${t.correo}</td><td>${t.whatsapp}</td><td>${t.fecha}</td><td>${t.hora}</td></tr>`;
  });

  tabla += '</tbody></table></div></section>';

  res.send(`
    <html><head><meta charset="UTF-8"><title>Panel ${clienteId}</title>
    <link rel="stylesheet" href="${cssPath}">
    </head><body>${tabla}
    <script>
    function aplicarFiltros() {
      const n = document.getElementById('filtroNombre').value.toLowerCase();
      const f = document.getElementById('filtroFecha').value;
      document.querySelectorAll('tbody tr').forEach(tr => {
        const tn = tr.children[0].innerText.toLowerCase();
        const tf = tr.children[3].innerText;
        tr.style.display = (!n || tn.includes(n)) && (!f || tf === f) ? '' : 'none';
      });
    }
    function resetearFiltros() {
      document.getElementById('filtroNombre').value = '';
      document.getElementById('filtroFecha').value = '';
      aplicarFiltros();
    }
    </script>
    </body></html>
  `);
});

app.get('/api/turnos-ocupados/:clienteId', (req, res) => {
  const { clienteId } = req.params;
  const { fecha } = req.query;
  if (!clienteId || !fecha) return res.status(400).json({ error: 'Faltan datos' });
  const ocupados = cargarTurnos(clienteId).filter(t => t.fecha === fecha).map(t => t.hora);
  res.json({ ocupados });
});

app.post('/api/agendar/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { nombre, correo, fecha, hora, whatsapp } = req.body;

    const config = cargarConfig(clienteId);
    if (!config) return res.status(404).json({ mensaje: 'Cliente no válido' });

    if (!estaEnHorarioPermitido(config, fecha, hora)) {
      return res.status(400).json({ mensaje: 'Horario no permitido' });
    }

    if (!estaDisponible(clienteId, fecha, hora, correo)) {
      return res.status(400).json({ mensaje: 'Turno no disponible' });
    }

    guardarTurno(clienteId, { nombre, correo, fecha, hora, whatsapp });

    const transport = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS
      }
    });

    transport.verify((error, success) => {
      if (error) console.error('❌ Error SMTP:', error);
      else console.log('✅ SMTP listo');
    });

    await transport.sendMail({
      from: `Turnos Web <${process.env.EMAIL}>`,
      to: correo,
      subject: `Turno confirmado con ${config.nombre}`,
      html: `<h1>Turno Confirmado</h1><p>Hola ${nombre}, tu turno está agendado para ${fecha} a las ${hora}.</p>`
    });

    res.json({ mensaje: 'Turno confirmado y enviado por mail' });

  } catch (error) {
    console.error('Error al agendar:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
});
app.get('/', (req, res) => res.send('Servidor funcionando correctamente.'));

app.listen(PORT, () => console.log(`Servidor funcionando en http://localhost:${PORT}`));
