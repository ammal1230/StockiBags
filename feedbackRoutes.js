const express  = require("express");
const router   = express.Router();
const Feedback = require("./models/feedback.js");


// GET tous les feedbacks
router.get("/feedbacks", async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, feedbacks });
  } catch (error) {
    console.error("Erreur GET feedbacks:", error.message);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// POST créer un feedback
router.post("/feedbacks", async (req, res) => {
  try {
    const { user, name, message, rating } = req.body;

    const feedback = new Feedback({
      user:    user || null,
      name:    name || '',
      message,
      rating:  typeof rating !== 'undefined' ? Number(rating) : 5,
    });

    await feedback.save();
    return res.status(201).json({ success: true, feedback });
  } catch (error) {
    console.error("Erreur POST feedback:", error.message);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

module.exports = router;