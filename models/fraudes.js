const mongoose = require("mongoose");

const fraudeSchema = new mongoose.Schema({
  deviceId: String,
  casierNumero: Number,
  casierSection: String,
  ville: String,
  message: String,
  CoffreOuvert: Boolean,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("fraudes", fraudeSchema);