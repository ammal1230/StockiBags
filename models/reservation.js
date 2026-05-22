const mongoose = require("mongoose");

const ReservationSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  taille:        { type: String, enum: ['Standard', 'Large', 'XL'], required: true },
  duree:         { type: Number, required: true },
  prixTotal:     { type: Number, required: true },
  code:          { type: String, default: '' },
  codeActif:     { type: Boolean, default: false },
  statut:        { type: String, enum: ['payee', 'terminee',`aucune reservation`], default: 'aucune reservation' },
  dateDebut:     { type: Date },
  dateFin:       { type: Date },
  heureDebut:    { type: String, default: '' },
  heureFin:      { type: String, default: '' },
  casierNumero:  { type: Number, default: null },
  casierSection: { type: String, default: '' },
  cinUser:       { type: String, default: '' },
  ville:         { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model("Reservation", ReservationSchema);