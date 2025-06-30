// server.js COMPLETO CORREGIDO con BUSCADOR ✅

const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const CLIENTES_DIR = path.join(__dirname, 'clientes');
const TURNOS_DIR = path.join(__dirname, 'turnos');
if (!fs.existsSync(TURNOS_DIR)) fs.mkdirSync(TURNOS_DIR);

function cargarConfig(clienteId) {
  const file = path.join(CLIENTES_DIR, clienteId, 'config.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file));
}

function cargarTurnos(clienteId) {
  const file = path.join(TURNOS_DIR, `${clienteId}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file));
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
  const dia = new Date(`${fecha}T${hora}`).getDay();
  const horaInt = parseInt(hora.split(':')[0]);
  return config.dias.includes(dia) && horaInt >= config.horaInicio && horaInt < config.horaFin;
}

// Ruta para mostrar formulario
app.get('/:clienteId', (req, res) => {
  const clienteId = req.params.clienteId;
  const configPath = path.join(__dirname, 'clientes', clienteId, 'config.json');

  if (!fs.existsSync(configPath)) return res.status(404).send('Cliente no encontrado');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const formPath = path.join(__dirname, 'public', 'form.html');
  let html = fs.readFileSync(formPath, 'utf8');

  const clienteCssPath = path.join(__dirname, 'public', 'clientes', clienteId, 'style.css');
const cssHref = fs.existsSync(clienteCssPath)
  ? `<link rel="stylesheet" href="/clientes/${clienteId}/style.css">`
  : `<link rel="stylesheet" href="/default.css">`;


  const logoHtml = fs.existsSync(path.join(__dirname, 'public', 'clientes', clienteId, 'logo.png'))
    ? `<img src="/clientes/${clienteId}/logo.png?v=${Date.now()}" alt="Logo de ${config.nombre}" style="height:70px; width:auto; margin-bottom:0.5rem;">`
    : '';

  const nombreHtml = `<p class="nombre-cliente">${config.nombre}</p>`;

  html = html.replace('<!-- CLIENTE_STYLE -->', cssHref);
  html = html.replace('<!-- CLIENTE_LOGO -->', logoHtml);
  html = html.replace('<!-- CLIENTE_NOMBRE -->', nombreHtml);

  res.send(html);
});

// Ruta para mostrar panel con buscador
app.get('/:clienteId/panel', (req, res) => {
  const clienteId = req.params.clienteId;
  const clave = req.query.clave;

  if (clave !== '1234') {
    return res.status(401).send('No autorizado');
  }

  const turnos = cargarTurnos(clienteId);

  const clienteCssPath = path.join(__dirname, 'public', 'clientes', clienteId, 'style.css');
  let cssLinks = '';

  if (fs.existsSync(clienteCssPath)) {
    cssLinks += `<link rel="stylesheet" href="/clientes/${clienteId}/style.css">`;
  } else {
    cssLinks += `<link rel="stylesheet" href="/default.css">`;
  }

  let tabla = `
    <section class="tabla-turnos">
      <h1>Turnos de ${clienteId}</h1>
      <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
        <input type="text" id="filtroNombre" placeholder="Filtrar por nombre..." style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #ccc;">
        <input type="date" id="filtroFecha" style="padding: 10px; border-radius: 8px; border: 1px solid #ccc;">
        <button onclick="aplicarFiltros()" style="padding: 10px 20px; border-radius: 8px;">Filtrar</button>
        <button onclick="resetearFiltros()" style="padding: 10px 20px; border-radius: 8px;">Limpiar</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>WhatsApp</th>
              <th>Fecha</th>
              <th>Hora</th>
            </tr>
          </thead>
          <tbody>
  `;

  turnos.forEach(turno => {
    tabla += `
      <tr>
        <td>${turno.nombre}</td>
        <td>${turno.correo}</td>
        <td>${turno.whatsapp}</td>
        <td>${turno.fecha}</td>
        <td>${turno.hora}</td>
      </tr>
    `;
  });

  tabla += `</tbody></table></div></section>`;

  res.send(`
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Panel de Turnos - ${clienteId}</title>
        ${cssLinks}
        <style>
          main.container {
            max-width: 100%;
            width: 95%;
            margin: 1rem auto;
            padding: 1rem;
            box-sizing: border-box;
            background-color: rgba(255,255,255,0.97);
            border-radius: 16px;
          }

          .table-wrapper {
            overflow-x: auto;
          }

          table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
          }

          td, th {
            word-wrap: break-word;
            white-space: normal;
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ccc;
          }

          @media (max-width: 768px) {
            table, thead, tbody, th, td, tr {
              display: block;
            }

            thead tr {
              display: none;
            }

            td {
              position: relative;
              padding-left: 50%;
              text-align: right;
            }

            td::before {
              position: absolute;
              top: 0;
              left: 10px;
              width: 45%;
              padding-right: 10px;
              white-space: nowrap;
              font-weight: bold;
              text-align: left;
            }

            td:nth-of-type(1)::before { content: "Nombre"; }
            td:nth-of-type(2)::before { content: "Correo"; }
            td:nth-of-type(3)::before { content: "WhatsApp"; }
            td:nth-of-type(4)::before { content: "Fecha"; }
            td:nth-of-type(5)::before { content: "Hora"; }
          }
        </style>
      </head>
      <body>
        <header>Panel de Turnos</header>
        <main class="container">
          ${tabla}
        </main>

        <script>
          function aplicarFiltros() {
            const nombre = document.getElementById('filtroNombre').value.toLowerCase();
            const fecha = document.getElementById('filtroFecha').value;

            document.querySelectorAll('tbody tr').forEach(tr => {
              const nombreTexto = tr.children[0].innerText.toLowerCase();
              const fechaTexto = tr.children[3].innerText;
              const coincideNombre = !nombre || nombreTexto.includes(nombre);
              const coincideFecha = !fecha || fechaTexto === fecha;
              tr.style.display = coincideNombre && coincideFecha ? '' : 'none';
            });
          }

          function resetearFiltros() {
            document.getElementById('filtroNombre').value = '';
            document.getElementById('filtroFecha').value = '';
            aplicarFiltros();
          }
        </script>
      </body>
    </html>
  `);
});


// Ruta para agendar turno
app.post('/api/agendar/:clienteId', async (req, res) => {
  const clienteId = req.params.clienteId;
  const { nombre, correo, fecha, hora, whatsapp } = req.body;
  const config = cargarConfig(clienteId);

  if (!config) return res.status(404).json({ mensaje: 'Cliente no válido' });

  if (!estaEnHorarioPermitido(config, fecha, hora)) {
    return res.status(400).json({ mensaje: 'Horario no permitido' });
  }

  if (!estaDisponible(clienteId, fecha, hora, correo)) {
    return res.status(400).json({ mensaje: 'No se puede reservar más turnos ese día o ya ocupado' });
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

  const logoUrl = `http://localhost:3000/clientes/${clienteId}/logo.png`;

  await transport.sendMail({
    from: `Turnos Web <${process.env.EMAIL}>`,
    to: correo,
    subject: `Turno confirmado con ${config.nombre}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9; color: #333;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Logo" style="height: 80px; margin-bottom: 20px;">
          <h1 style="color: #bb8b6c;">Turno Confirmado</h1>
        </div>
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Tu turno con <strong>${config.nombre}</strong> (${config.rubro}) ha sido confirmado.</p>
        <p><strong>Fecha:</strong> ${fecha}<br>
          <strong>Hora:</strong> ${hora}</p>
        <br>
        <p>¡Te esperamos!</p>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">Pimex Consultora - Reservas Online</p>
      </div>
    `
  });

  res.json({ mensaje: 'Turno confirmado y enviado por mail' });
});

app.get('/', (req, res) => {
  res.send('Servidor funcionando. Agregá /dentista-jorge u otro ID de cliente');
});

// Ruta base para evitar error 404 en '/'
app.get('/', (req, res) => {
  res.send('Servidor funcionando correctamente.');
});

app.listen(3000, () => {
  console.log('Turnero funcionando en http://localhost:3000');
});


