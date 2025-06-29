const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'turnos.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite.');
    // Inicializar tablas si no existen
    db.serialize(() => {
      // Tabla de clientes (información de estética/dentista)
      db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        rubro TEXT NOT NULL,
        telefono TEXT,
        email TEXT,
        direccion TEXT,
        horarioAtencion TEXT, -- JSON string: { "apertura": "HH:MM", "cierre": "HH:MM" }
        intervaloTurnos TEXT, -- HH:MM
        diasAtencion TEXT    -- JSON string: { "lunes": true, "martes": true, ... }
      )`);

      // Tabla de turnos
      db.run(`CREATE TABLE IF NOT EXISTS turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clienteId TEXT NOT NULL,
        nombre TEXT NOT NULL,
        correo TEXT NOT NULL,
        fecha TEXT NOT NULL,
        hora TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clienteId) REFERENCES clientes(id)
      )`);

      // Insertar datos de clientes de ejemplo si no existen
      insertarClientesIniciales(db);
    });
  }
});

function insertarClientesIniciales(db) {
  const clientesIniciales = [
    {
      id: 'dentista-jorge',
      nombre: 'Consultorio Dental Dr. Jorge',
      rubro: 'Odontología',
      telefono: '1122334455',
      email: 'jorge.dentista@example.com',
      direccion: 'Av. Siempre Viva 742, Buenos Aires',
      horarioAtencion: JSON.stringify({ apertura: '09:00', cierre: '18:00' }),
      intervaloTurnos: '00:30',
      diasAtencion: JSON.stringify({
        lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: false, domingo: false
      })
    },
    {
      id: 'estetica-vera-luna',
      nombre: 'Estética Vera Luna',
      rubro: 'Belleza',
      telefono: '1199887766',
      email: 'info@veraluna.com',
      direccion: 'Calle Falsa 123, Buenos Aires',
      horarioAtencion: JSON.stringify({ apertura: '10:00', cierre: '19:00' }),
      intervaloTurnos: '01:00', // Ejemplo: turnos cada 1 hora
      diasAtencion: JSON.stringify({
        lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: true, domingo: false
      })
    }
  ];

  clientesIniciales.forEach(cliente => {
    db.get('SELECT id FROM clientes WHERE id = ?', [cliente.id], (err, row) => {
      if (err) {
        console.error('Error al verificar cliente:', err.message);
        return;
      }
      if (!row) {
        db.run(`INSERT INTO clientes (id, nombre, rubro, telefono, email, direccion, horarioAtencion, intervaloTurnos, diasAtencion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cliente.id,
            cliente.nombre,
            cliente.rubro,
            cliente.telefono,
            cliente.email,
            cliente.direccion,
            cliente.horarioAtencion,
            cliente.intervaloTurnos,
            cliente.diasAtencion
          ],
          function(err) {
            if (err) {
              console.error(`Error al insertar cliente ${cliente.id}:`, err.message);
            } else {
              console.log(`Cliente ${cliente.nombre} insertado. ID: ${this.lastID}`);
            }
          }
        );
      }
    });
  });
}

// Funciones para interactuar con la base de datos

// Clientes
const getClientes = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM clientes', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Parsear los campos JSON antes de devolverlos
        const clientesParseados = rows.map(row => ({
          ...row,
          horarioAtencion: JSON.parse(row.horarioAtencion),
          diasAtencion: JSON.parse(row.diasAtencion)
        }));
        resolve(clientesParseados);
      }
    });
  });
};

const getClienteById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM clientes WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else if (row) {
        // Parsear los campos JSON antes de devolverlos
        resolve({
          ...row,
          horarioAtencion: JSON.parse(row.horarioAtencion),
          diasAtencion: JSON.parse(row.diasAtencion)
        });
      } else {
        resolve(null); // Cliente no encontrado
      }
    });
  });
};

// Turnos
const getTurnosByClienteId = (clienteId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM turnos WHERE clienteId = ? ORDER BY fecha ASC, hora ASC', [clienteId], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const addTurno = (clienteId, nombre, correo, fecha, hora, whatsapp) => {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO turnos (clienteId, nombre, correo, fecha, hora, whatsapp) VALUES (?, ?, ?, ?, ?, ?)`,
      [clienteId, nombre, correo, fecha, hora, whatsapp],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, clienteId, nombre, correo, fecha, hora, whatsapp });
        }
      }
    );
  });
};

const getTurnoByClienteFechaHora = (clienteId, fecha, hora) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM turnos WHERE clienteId = ? AND fecha = ? AND hora = ?', [clienteId, fecha, hora], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row); // Retorna el turno si existe, null si no
      }
    });
  });
};

module.exports = {
  db, // Exportar la instancia de la base de datos (para cerrar la conexión si es necesario)
  getClientes,
  getClienteById,
  getTurnosByClienteId,
  addTurno,
  getTurnoByClienteFechaHora
};