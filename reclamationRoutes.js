const express     = require("express");
const router      = express.Router();
const Reclamation = require("./models/reclamation.js");

// POST envoyer une réclamation (mobile + admin)
router.post("/reclamations", async (req, res) => {
  try {
    const { userId, user, message, reponse } = req.body;

    const finalUserId = userId || user; 

    if (!finalUserId) 
      return res.status(400).json({ success: false, message: "User manquant" });

    if (!message?.trim()) 
      return res.status(400).json({ success: false, message: "Message vide" });

    const rec = new Reclamation({
      user:       finalUserId,
      message,    
      reponse:    reponse    || "",
    });

    await rec.save();
    return res.status(201).json({ success: true, reclamation: rec });
  } catch (e) {
    console.error("Erreur POST /reclamations:", e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
});

// GET réclamations d'un user (mobile)
router.get("/reclamations/user/:userId", async (req, res) => {
  try {
    const recs = await Reclamation.find({ user: req.params.userId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, reclamations: recs });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// GET toutes les réclamations (admin)
router.get("/reclamations", async (req, res) => {
  try {
    const recs = await Reclamation.find()
      .populate("user", "name lastname email")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, reclamations: recs });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// PUT répondre à une réclamation (admin)
router.put("/reclamations/:id/repondre", async (req, res) => {
  try {
    const { reponse } = req.body;
    const rec = await Reclamation.findByIdAndUpdate(
      req.params.id,
      { reponse },
      { new: true }
    );
    return res.status(200).json({ success: true, reclamation: rec });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

module.exports = router;