const express = require("express");
const router  = express.Router();

const CasierSousse   = require("./models/casierSousse.js");
const CasierMonastir = require("./models/casierMonastir.js");
const CasierMahdia   = require("./models/casierMahdia.js");

const CASIER_MODELS = {
  sousse:   CasierSousse,
  monastir: CasierMonastir,
  mahdia:   CasierMahdia,
};
// ─────────────────────────────────────────────
// POST ajouter une nouvelle section
// ─────────────────────────────────────────────
router.post("/regions/:regionKey/casiers/ajouter-section", async (req, res) => {
  try {
    const Model   = CASIER_MODELS[req.params.regionKey];
    const { casiers } = req.body;
    const section = casiers[0]?.section;

    console.log("CASIERS REÇUS:", casiers.length); 
    console.log("PREMIER:", casiers[0]);            
    console.log("DERNIER:", casiers[11]);           

    const existe = await Model.findOne({ section });
    if (existe) return res.status(400).json({ success: false, message: "Section déjà existante" });

    const result = await Model.insertMany(casiers);
    console.log("INSÉRÉS:", result.length); 

    return res.json({ success: true, message: `Section ${section} ajoutée` });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false });
  }
});
// ─────────────────────────────────────────────
// DELETE supprimer une section
// ─────────────────────────────────────────────
router.delete("/regions/:regionKey/casiers/section/:section", async (req, res) => {
  try {
    const Model   = CASIER_MODELS[req.params.regionKey];
    const section = req.params.section;

    console.log("SUPPRESSION section:", section); 
    console.log("REGION:", req.params.regionKey); 

    if (!Model) return res.status(404).json({ success: false });

    if (["A", "B"].includes(section)) {
      return res.status(400).json({ success: false, message: "Impossible de supprimer A et B" });
    }

    const result = await Model.deleteMany({ section });
    console.log("SUPPRIMÉS:", result.deletedCount); 

    return res.json({ success: true, message: `Section ${section} supprimée` });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// GET tous les casiers d'une région
// ─────────────────────────────────────────────
router.get("/regions/:regionKey/casiers", async (req, res) => {
  try {
    const Model = CASIER_MODELS[req.params.regionKey];
    if (!Model) return res.status(404).json({ success: false, message: "Région introuvable" });
    const casiers = await Model.find().sort({ section: 1, numero: 1 });
    return res.status(200).json({ success: true, casiers });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ─────────────────────────────────────────────
// PUT mettre à jour les états casiers
// ─────────────────────────────────────────────
router.put("/regions/:regionKey/casiers", async (req, res) => {
  try {
    const Model = CASIER_MODELS[req.params.regionKey];
    if (!Model) return res.status(404).json({ success: false, message: "Erreur" });
    const { casiers } = req.body;
    for (const c of casiers) {
      await Model.findOneAndUpdate(
        { numero: c.numero, section: c.section },
        { etat: c.etat, reserve: c.etat === 'reserve', taille: c.taille },
        { upsert: true, returnDocument: 'after' }
      );
    }
    return res.status(200).json({ success: true, message: "Casiers mis à jour" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ─────────────────────────────────────────────
// PUT marquer un casier réservé (mobile)
// ─────────────────────────────────────────────
router.put("/regions/:regionKey/casiers/:numero/reserver", async (req, res) => {
  try {
    const Model = CASIER_MODELS[req.params.regionKey];
    if (!Model) return res.status(404).json({ success: false, message: "Région introuvable" });
    const { section } = req.body;
    const casier = await Model.findOneAndUpdate(
      { numero: Number(req.params.numero), section },
      { etat: 'reserve', reserve: true },
      { returnDocument: 'after' }
    );
    return res.status(200).json({ success: true, casier });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ─────────────────────────────────────────────
// GET casier disponible par taille (mobile)
// ─────────────────────────────────────────────
router.get("/casiers/:region/disponible", async (req, res) => {
  try {
    const Model = CASIER_MODELS[req.params.region];
    if (!Model) return res.status(404).json({ success: false, message: "Région introuvable" });

    const { taille, dateDebut, dateFin } = req.query;

    if (dateDebut && dateFin) {
      const Reservation = require("./models/reservation.js");
      
      const tousLesCasiers = await Model.find({
        ...(taille && { taille }),
        etat: { $nin: ["bloque", "en_panne"] }
      });

      const reservationsChevauche = await Reservation.find({
        ville:     req.params.region,
        ...(taille && { taille }),
        statut:    { $in: ["payee", "active"] },
        dateDebut: { $lt: new Date(dateFin) },
        dateFin:   { $gt: new Date(dateDebut) }
      });

      const casierOccupes = reservationsChevauche.map(r => ({
        numero:  r.casierNumero,
        section: r.casierSection
      }));

      const casierLibre = tousLesCasiers.find(c =>
        !casierOccupes.some(o => o.numero === c.numero && o.section === c.section)
      );

      if (!casierLibre) return res.status(404).json({ success: false });
      return res.status(200).json({ success: true, casier: casierLibre });
    }

    // sans dates
    const casier = await Model.findOne({
      ...(taille && { taille }),
      etat: { $nin: ["bloque", "en_panne"] }
    });

    if (!casier) return res.status(404).json({ success: false, message: "Aucun casier disponible" });
    return res.status(200).json({ success: true, casier });

  } catch (error) {
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// GET tailles disponibles et bloquées par ville

router.get("/casiers/disponibles", async (req, res) => {
  try {
    const ville = req.query.ville?.toLowerCase();
    const Model = CASIER_MODELS[ville];
    if (!Model) return res.status(404).json({ success: false });

    const casiers = await Model.find();

    // Tailles dont TOUS les coffres sont bloqués ou en panne
    const tailles = ["Standard", "Large", "XL"];

    const taillesBloquees = tailles.filter(taille => {
      const casiersDeTaille = casiers.filter(c => c.taille === taille);
      if (casiersDeTaille.length === 0) return false;
      return casiersDeTaille.every(c => c.etat === "bloque" || c.etat === "en_panne");
    });

    const taillesDisponibles = tailles.filter(t => !taillesBloquees.includes(t));

    return res.json({ 
      success: true, 
      tailles: taillesDisponibles,      
      taillesBloquees: taillesBloquees  
    });

  } catch (error) {
    return res.status(500).json({ success: false });
  }
});


module.exports = router;