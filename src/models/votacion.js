const mongoose = require('mongoose');

// Modelos de lectura sobre la base compartida con achura-awards.
// Solo se usan en scripts/sync-resultados.js para leer los votos reales.

const CategoriaSchema = new mongoose.Schema(
  {
    id_web: { type: String, default: null },
    nombre: { type: String },
    activa: { type: Boolean, default: true },
    posicion: { type: Number },
  },
  { collection: 'categorias', strict: false }
);

const OpcionSchema = new mongoose.Schema(
  {
    id_web: { type: String, default: null },
    categoria: { type: mongoose.Schema.Types.ObjectId },
    nombre: { type: String },
    votos: { type: Number, default: 0 },
    posicion: { type: Number },
  },
  { collection: 'opcions', strict: false }
);

const VotoSchema = new mongoose.Schema(
  {
    categoria: { type: mongoose.Schema.Types.ObjectId },
    opcion: { type: mongoose.Schema.Types.ObjectId },
    usuario: { type: mongoose.Schema.Types.ObjectId },
    numero: { type: Number },
    peso: { type: Number },
  },
  { collection: 'votos', strict: false }
);

const Categoria = mongoose.models.Categoria || mongoose.model('Categoria', CategoriaSchema);
const Opcion = mongoose.models.Opcion || mongoose.model('Opcion', OpcionSchema);
const Voto = mongoose.models.Voto || mongoose.model('Voto', VotoSchema);

module.exports = { Categoria, Opcion, Voto };
