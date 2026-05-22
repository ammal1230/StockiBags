// models/reclamation.js
const mongoose = require("mongoose");

const ReclamationSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message:    { type: String, required: true },
  reponse:    { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model("Reclamation", ReclamationSchema);
