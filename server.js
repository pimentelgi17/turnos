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
  <section style="max-width: 1000px; margin: 40px auto; text-align: center;">
    <h1 style="margin-bottom: 20px;">Turnos de <span style="color:#b47b56;">${clienteId}</span></h1>
    
    <div style="margin-bottom: 20px;">
      <input type="text" id="filtroNombre" placeholder="Filtrar por nombre..." style="padding:8px;">
      <input type="date" id="filtroFecha" style="padding:8px;">
      <button onclick="aplicarFiltros()" style="padding:8px;">Filtrar</button>
      <button onclick="resetearFiltros()" style="padding:8px;">Limpiar</button>
    </div>

    <div style="overflow-x:auto;">
      <table style="width: 100%; border-collapse: collapse; background: #fff; table-layout: auto;">
        <thead style="background-color: #b47b56; color: white;">
          <tr>
            <th style="padding: 12px;">Nombre</th>
            <th style="padding: 12px;">Correo</th>
            <th style="padding: 12px;">WhatsApp</th>
            <th style="padding: 12px;">Fecha</th>
            <th style="padding: 12px;">Hora</th>
            <th style="padding: 12px;">Servicio</th>
            <th style="padding: 12px;">Acción</th>
          </tr>
        </thead>
        <tbody>
`;

turnos.forEach(t => {
  tabla += `
    <tr>
      <td style="padding: 10px; max-width: 200px; word-break: break-word;">${t.nombre}</td>
      <td style="padding: 10px; max-width: 220px; word-break: break-word;">${t.correo}</td>
      <td style="padding: 10px; max-width: 150px; word-break: break-word;">${t.whatsapp}</td>
      <td style="padding: 10px;">${t.fecha}</td>
      <td style="padding: 10px;">${t.hora}</td>
      <td style="padding: 10px; max-width: 220px; word-break: break-word;">${t.servicio || ''}</td>
      <td style="padding: 10px;">
        <button onclick="borrarTurno('${clienteId}', '${t.fecha}', '${t.hora}')" style="padding:5px 10px;">❌ Borrar</button>
      </td>
    </tr>
  `;
});

tabla += `
        </tbody>
      </table>
    </div>
  </section>
`;
;

  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Panel ${clienteId}</title>
        <link rel="stylesheet" href="${cssPath}">
      </head>
      <body style="font-family: Arial, sans-serif; background: #f9f9f9;">
        ${tabla}
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

          async function borrarTurno(clienteId, fecha, hora) {
            if (confirm(\`¿Seguro que querés borrar el turno del \${fecha} a las \${hora}?\`)) {
              const res = await fetch(\`/api/borrar-turno/\${clienteId}?fecha=\${fecha}&hora=\${hora}\`, { method: 'DELETE' });
              const data = await res.json();
              alert(data.mensaje);
              location.reload();
            }
          }
        </script>
      </body>
    </html>
  `);
});
app.delete('/api/borrar-turno/:clienteId', (req, res) => {
  const clienteId = req.params.clienteId;
  const { fecha, hora } = req.query;
  const turnos = cargarTurnos(clienteId).filter(t => !(t.fecha === fecha && t.hora === hora));
  fs.writeFileSync(path.join(TURNOS_DIR, `${clienteId}.json`), JSON.stringify(turnos, null, 2));
  res.json({ mensaje: 'Turno eliminado correctamente' });
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
    const { nombre, correo, fecha, hora, whatsapp, servicio } = req.body;

    const config = cargarConfig(clienteId);
    if (!config) return res.status(404).json({ mensaje: 'Cliente no válido' });

    if (!estaEnHorarioPermitido(config, fecha, hora)) {
      return res.status(400).json({ mensaje: 'Horario no permitido' });
    }

    if (!estaDisponible(clienteId, fecha, hora, correo)) {
      return res.status(400).json({ mensaje: 'Turno no disponible' });
    }

    // Guardar el turno
    guardarTurno(clienteId, { nombre, correo, fecha, hora, whatsapp, servicio });

    // Preparar mail
    const transport = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS
      }
    });

const señaMonto = config.seña ? `$${config.seña.toLocaleString('es-AR')}` : null;

const htmlMensaje = `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; color: #333;">
    <div style="max-width: 600px; margin: auto; background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      
      <h1 style="color: #b47b56; text-align: center;">✨ Turno Confirmado ✨</h1>
      
      <p style="font-size: 16px;">Hola <strong>${nombre}</strong>,</p>
      
      <p style="font-size: 16px;">
        Tu turno con <strong>${config.nombre}</strong> está confirmado. A continuación te dejamos los detalles:
      </p>
      
      <ul style="list-style: none; padding: 0; font-size: 16px;">
        <li><strong>📅 Fecha:</strong> ${fecha}</li>
        <li><strong>⏰ Hora:</strong> ${hora}</li>
        <li><strong>💆‍♀️ Servicio:</strong> ${servicio || 'Sin especificar'}</li>
      </ul>

<<<<<<< HEAD
      ${señaMonto ? `
        <p style="font-size: 15px; margin-top: 20px; color: #b47b56;">
          Para confirmar tu turno es necesario abonar una seña de <strong>${señaMonto}</strong>.<br>
          Alias para transferencia: <strong>lucas.estetica.lucas.maximiliano.torres</strong>
        </p>
        <p style="font-size: 14px; margin-top: 10px;">
          Por favor, envianos el comprobante por WhatsApp una vez que realices la transferencia para validar tu reserva.
        </p>
      ` : ''}

      <p style="font-size: 15px; margin-top: 20px;">
        Te esperamos. Si necesitás cancelar o modificar tu turno, por favor comunicate con nosotros.
      </p>
      
      <p style="font-size: 13px; color: #999; margin-top: 30px;">
        Este es un mensaje automático de <strong>Pimex Consultora</strong>.
      </p>
    </div>
  </div>
`;
=======
          ${señaMonto && linkPago ? `
            <p style="font-size: 15px; margin-top: 20px; color: #b47b56;">
              Para confirmar tu turno es necesario abonar una seña de <strong>${señaMonto} Alias: lucas.Estetica Lucas Maximiliano Torres</strong>.
            </p>
            <p><a href="${linkPago}" target="_blank" style="display:inline-block; padding:10px 20px; background:#b47b56; color:#fff; text-decoration:none; border-radius:5px;">👉 Pagar Seña Online</a></p>
          ` : ''}
>>>>>>> 23c459964bf3ecd01087b76bc72aecce1ce59b21


    console.log('📧 Preparando envío de mail...');
    await transport.sendMail({
      from: `Turnos Web <${process.env.EMAIL}>`,
      to: correo,
      subject: `Turno confirmado con ${config.nombre}`,
      html: htmlMensaje
    });
    console.log('✅ Mail enviado');

    res.json({ mensaje: 'Turno confirmado y enviado por mail' });

  } catch (error) {
    console.error('❌ Error al agendar:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
});

function obtenerHorariosDisponibles(config, turnosDelDia, servicio, fecha) {
  const diaSemana = new Date(`${fecha}T00:00`).getDay();
  const horarioDia = config.horarios?.[diaSemana];
  const duracionServicio = config.servicios?.[servicio];

  if (!horarioDia || !duracionServicio) return [];

  const inicioMinutos = horarioDia.inicio * 60;
  const finMinutos = horarioDia.fin * 60;

  // Convertir turnos existentes a rangos ocupados
  const ocupados = turnosDelDia.map(t => {
    const [h, m] = t.hora.split(':').map(Number);
    const inicio = h * 60 + m;
    const duracion = config.servicios?.[t.servicio] || 30;
    return { inicio, fin: inicio + duracion };
  });

  const horariosLibres = [];
  let momentoActual = inicioMinutos;

  while (momentoActual + duracionServicio <= finMinutos) {
    const solapado = ocupados.some(t => 
      momentoActual < t.fin && (momentoActual + duracionServicio) > t.inicio
    );

    if (!solapado) {
      const horaStr = `${String(Math.floor(momentoActual / 60)).padStart(2, '0')}:${String(momentoActual % 60).padStart(2, '0')}`;
      horariosLibres.push(horaStr);
    }

    // Avanza en bloques de 15 minutos pero respeta el rango
    momentoActual += 15;
  }

  return horariosLibres;
}




app.get('/api/horarios-disponibles/:clienteId', (req, res) => {
  const clienteId = req.params.clienteId;
  const { fecha, servicio } = req.query;

  if (!clienteId || !fecha || !servicio) {
    return res.status(400).json({ mensaje: 'Faltan datos' });
  }

  const config = cargarConfig(clienteId);
  if (!config) return res.status(404).json({ mensaje: 'Cliente no encontrado' });

  const turnos = cargarTurnos(clienteId).filter(t => t.fecha === fecha);
  const horarios = obtenerHorariosDisponibles(config, turnos, servicio, fecha);

  res.json({ horarios });
});


app.get('/', (req, res) => res.send('Servidor funcionando correctamente.'));

app.listen(PORT, () => console.log(`Servidor funcionando en http://localhost:${PORT}`));
