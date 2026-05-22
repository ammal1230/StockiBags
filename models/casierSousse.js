const mongoose = require("mongoose");

const CasierSousseSchema = new mongoose.Schema({
  numero:  { type: Number, required: true },
  section: { type: String, enum: ["A", "B", "C", "D"], required: true },
  taille:  { type: String, enum: ['Standard', 'Large', 'XL'], required: true },
  etat:    { type: String, enum: ['disponible', 'reserve', 'en_panne', 'bloque'], default: 'disponible' },
  reserve: { type: Boolean, default: false },
  cinUser:     { type: String, default: '' },
});

module.exports = mongoose.model("CasierSousse", CasierSousseSchema);