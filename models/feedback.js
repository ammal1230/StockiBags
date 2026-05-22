const mongoose = require("mongoose");

const FeedbackSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
  name:      { type: String, default: '' },
  message:   { type: String, required: true },
  rating:    { type: Number, min: 0, max: 5, default: 5 }
}, { timestamps: true });

module.exports = mongoose.model("Feedback", FeedbackSchema);