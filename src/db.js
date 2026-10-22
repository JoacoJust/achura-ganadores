const mongoose = require('mongoose');

let ready = null;

// Conexión perezosa: el sitio anda aunque la base no esté disponible
// (las ternas se leen de un JSON generado en el build; solo el voto de Outfit necesita la base).
function connect() {
  if (!process.env.MONGO_URI) return Promise.reject(new Error('Falta MONGO_URI'));
  if (!ready) {
    ready = mongoose.connect(process.env.MONGO_URI).then(() => mongoose);
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

module.exports = { connect };
