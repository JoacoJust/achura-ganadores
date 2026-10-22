const mongoose = require('mongoose');

// Un voto de "Outfit del día".
// token: identificador anónimo que se guarda en una cookie del navegador,
// así cada dispositivo vota una sola vez sin necesidad de login.
const OutfitVotoSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    invitado: { type: String, required: true, index: true },
    // Quién vota: el id del invitado del padrón (una persona = un voto).
    votante: { type: String },
    nombre: { type: String, default: '' },
    ip_address: { type: String },
    user_agent: { type: String },
  },
  { timestamps: true, collection: 'outfit_votos' }
);

// Una persona no puede votar dos veces (los votos viejos, sin `votante`, no entran)
OutfitVotoSchema.index(
  { votante: 1 },
  { unique: true, partialFilterExpression: { votante: { $type: 'string' } } }
);

module.exports = mongoose.model('OutfitVoto', OutfitVotoSchema);
