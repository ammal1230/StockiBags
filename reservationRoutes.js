const express        = require("express");
const router         = express.Router();
const Reservation    = require("./models/reservation.js");
const User           = require("./models/user.js");
const CasierSousse   = require("./models/casierSousse.js");
const CasierMonastir = require("./models/casierMonastir.js");
const CasierMahdia   = require("./models/casierMahdia.js");
const Fraude         = require("./models/fraudes");

const CASIER_MODELS = {
  sousse:   CasierSousse,
  monastir: CasierMonastir,
  mahdia:   CasierMahdia,
};

const PRIX_EXTENSION = { Standard: 5000, Large: 8000, XL: 12000 };

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const formatHeure = (date, offsetHours = 1) => {
  const localDate = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  const h24    = localDate.getUTCHours();
  const m      = localDate.getUTCMinutes().toString().padStart(2, '0');
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12    = h24 % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${m} ${period}`;
};

const cron = require('node-cron');

// Toutes les minutes
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();

    const result = await Reservation.updateMany(
      { codeActif: true, statut: 'payee', dateFin: { $lt: now } },
      { $set: { codeActif: false} }
    );

    if (result.modifiedCount > 0) {
      console.log(` ${result.modifiedCount} code(s) désactivé(s) automatiquement`);
    }

  } catch (err) {
    console.error('Erreur cron:', err);
  }
});

// ─────────────────────────────────────────────
// POST créer réservation
// ─────────────────────────────────────────────
router.post("/reservations", async (req, res) => {
  try {
    const { userId, taille, duree, prixTotal, cardNumber, heureDebut, heureFin, dateDebut, dateFin } = req.body;

    if (!cardNumber || cardNumber.replace(/\s/g, "").length < 16) {
      return res.status(400).json({ success: false, message: "Carte invalide" });
    }

    const userDoc = await User.findById(userId).select("cin ville");
    const cin     = userDoc?.cin || "";
    const ville   = userDoc?.ville?.toLowerCase() || "";
    const Model   = CASIER_MODELS[ville];
    if (!Model) return res.status(400).json({ success: false });

    const dateDebutFinal = new Date(dateDebut);
    const dateFinFinal   = new Date(dateFin);

    const sontConsecutifs = (startA, endA, startB, endB) => {
      const TOLERANCE_MS = 5 * 60 * 1000; 
      
      // chevauchement
      const seChevauchent = startA < endB && startB < endA;

      const commenceJusteApres = (startB.getTime() - endA.getTime() <= TOLERANCE_MS) && startB >= endA;
      const finitJusteAvant = (startA.getTime() - endB.getTime() <= TOLERANCE_MS) && endB <= startA;

      return seChevauchent || commenceJusteApres || finitJusteAvant;
    };

   
    const existing = await Reservation.findOne({
      user:   userId,
      ville,
      taille,
      statut: "payee",
    }).sort({ dateDebut: -1 }); 

        if (existing) {
     
      if (sontConsecutifs(existing.dateDebut, existing.dateFin, dateDebutFinal, dateFinFinal)) {
        
        const conflitSurMemeCasier = await Reservation.findOne({
          ville: ville,
          taille: taille,
          casierNumero: existing.casierNumero,
          casierSection: existing.casierSection,
          statut: "payee",
          _id: { $ne: existing._id }, 
          dateDebut: { $lt: dateFinFinal },
          dateFin:   { $gt: dateDebutFinal }
        });

        // fusionner si personne n'a réservé ce coffre à cette heure
        if (!conflitSurMemeCasier) {
          
          const newStart = new Date(Math.min(existing.dateDebut.getTime(), dateDebutFinal.getTime()));
          const newEnd   = new Date(Math.max(existing.dateFin.getTime(),   dateFinFinal.getTime()));
          const newDuree = Math.ceil((newEnd - newStart) / 3600000);

          await Reservation.findByIdAndUpdate(existing._id, {
            dateDebut:  newStart,
            dateFin:    newEnd,
            heureDebut: formatHeure(newStart),
            heureFin:   formatHeure(newEnd),
            duree:      newDuree,
            prixTotal:  (existing.prixTotal || 0) + (prixTotal || 0),
          });

          const updated = await Reservation.findById(existing._id);

          return res.json({
            success:       true,
            fusionnee:     true,
            code:          updated.code,
            reservationId: updated._id,
            casierNumero:  updated.casierNumero,
            casierSection: updated.casierSection,
            dateDebut:     updated.dateDebut,
            dateFin:       updated.dateFin,
            prixTotal:     updated.prixTotal,
          });
        }
      }
    }
    const tousLesCasiers = await Model.find({
  taille,
  etat: { $nin: ['en_panne', 'bloque'] },
});

    const reservationsChevauche = await Reservation.find({
      ville,
      taille,
      statut:    "payee",
      dateDebut: { $lt: dateFinFinal },
      dateFin:   { $gt: dateDebutFinal },
    });

    const casierOccupes = reservationsChevauche.map(r => ({
      numero:  r.casierNumero,
      section: r.casierSection,
    }));

    const casierLibre = tousLesCasiers.find(c =>
      !casierOccupes.some(o => o.numero === c.numero && o.section === c.section)
    );

    if (!casierLibre) {
      return res.status(409).json({ success: false, message: "Aucun casier disponible pour le moment, vous pouvez changer horaires." });
    }

    await Model.findOneAndUpdate(
      { numero: casierLibre.numero, section: casierLibre.section },
      { $set: { cinUser: cin, etat: "reserve", reserve: true } }
    );

    const code        = generateCode();
    const reservation = new Reservation({
      user:          userId,
      taille,
      duree,
      prixTotal,
      code,
      statut:        "payee",
      codeActif:     false,
      dateDebut:     dateDebutFinal,
      dateFin:       dateFinFinal,
      heureDebut,
      heureFin,
      casierNumero:  casierLibre.numero,
      casierSection: casierLibre.section,
      cinUser:       cin,
      ville,
    });

    await reservation.save();

    return res.json({
      success:       true,
      fusionnee:     false, 
      code,
      reservationId: reservation._id,
      casierNumero:  casierLibre.numero,
      casierSection: casierLibre.section,
      dateDebut:     dateDebutFinal,
      dateFin:       dateFinFinal,
      prixTotal,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});
// ─────────────────────────────────────────────
// GET créneaux occupés
// ─────────────────────────────────────────────
/*router.get("/reservations/creneaux-occupes", async (req, res) => {
  try {
    const { ville, taille, dateDebut, dateFin } = req.query;

    const reservations = await Reservation.find({
      ville,
      taille,
      statut:    "payee",
      dateDebut: { $lt: new Date(dateFin) },
      dateFin:   { $gt: new Date(dateDebut) },
    });

    const heures = new Set();
    reservations.forEach(r => {
      const d = new Date(r.dateDebut.getTime() + 3600000).getUTCHours();
      const f = new Date(r.dateFin.getTime()   + 3600000).getUTCHours();
      for (let i = d; i < f; i++) heures.add(i);
    });

    res.json({ success: true, heuresOccupees: [...heures] });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});*/

// ─────────────────────────────────────────────
// POST activer code
// ─────────────────────────────────────────────
router.post("/reservations/:id/activer-code", async (req, res) => {
  try {
    const r = await Reservation.findById(req.params.id);
    if (!r) return res.status(404).json({ success: false });
    await Reservation.findByIdAndUpdate(req.params.id, { codeActif: true });
    res.json({ success: true, code: r.code });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// POST désactiver code
// ─────────────────────────────────────────────

router.post("/reservations/:id/desactiver-code", async (req, res) => {
  try {
    const r = await Reservation.findById(req.params.id);
    if (!r) return res.status(404).json({ success: false });

    const now = new Date();
    if (now < new Date(r.dateFin)) {
      return res.json({ success: false });
    }

    await Reservation.findByIdAndUpdate(req.params.id, {
      codeActif: false,
      statut: "en_attente", 
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// POST confirmer récupération
// ─────────────────────────────────────────────
router.post("/reservations/:id/confirmer", async (req, res) => {
  try {
    const r = await Reservation.findById(req.params.id);
    if (!r) return res.status(404).json({ success: false });

    const Model = CASIER_MODELS[r.ville];

    const now          = new Date();
    const resasFutures = await Reservation.findOne({
      casierNumero:  r.casierNumero,
      casierSection: r.casierSection,
      ville:         r.ville,
      statut:        "payee",
      dateFin:       { $gt: now },
      _id:           { $ne: r._id }
    });

    if (!resasFutures && Model) {
      await Model.findOneAndUpdate(
        { numero: r.casierNumero, section: r.casierSection },
        { etat: "disponible", reserve: false, cinUser: "" }
      );
    }

    await Reservation.findByIdAndUpdate(req.params.id, {
      statut:    "terminee",
      codeActif: false,
      code:      "",
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});
async function assignerNouveauCasier(
  r,
  nouveauCasier,
  taille,
  prix,
  oldEnd,
  newEnd,
  newHeureFin,
  duree,
  Model,
  res,
  isUpsell = false
) {
  await Reservation.findByIdAndUpdate(r._id, {
    statut: "terminee",
    codeActif: false,
    code: ""
  });

  const autre = await Reservation.findOne({
    casierNumero: r.casierNumero,
    casierSection: r.casierSection,
    ville: r.ville,
    statut: "payee"
  });

  if (!autre && Model) {
    await Model.findOneAndUpdate(
      { numero: r.casierNumero, section: r.casierSection },
      { etat: "disponible", reserve: false, cinUser: "" }
    );
  }

  await Model.findOneAndUpdate(
    { numero: nouveauCasier.numero, section: nouveauCasier.section },
    { cinUser: r.cinUser, etat: "reserve", reserve: true }
  );

  const code = generateCode();

  const newResa = new Reservation({
    user: r.user,
    taille,
    duree,
    prixTotal: prix,
    code,
    statut: "payee",
    codeActif: true,
    dateDebut: oldEnd,
    dateFin: newEnd,
    heureDebut: r.heureFin,
    heureFin: newHeureFin,
    casierNumero: nouveauCasier.numero,
    casierSection: nouveauCasier.section,
    cinUser: r.cinUser,
    ville: r.ville
  });

  await newResa.save();

  return res.json({
    success: true,
    option: isUpsell ? "UPSELL_ACCEPTED" : "CHANGED_LOCKER",
    code,
    casierNumero: nouveauCasier.numero,
    casierSection: nouveauCasier.section,
    prixTotal: prix
  });
}

// ─────────────────────────────────────────────
// POST prolonger (Escalade Intelligente)
// ─────────────────────────────────────────────
router.post("/reservations/:id/prolonger", async (req, res) => {
  try {
    const r = await Reservation.findById(req.params.id);
    console.log("=== PROLONGATION BACKEND ===");
    console.log("r.prixTotal:", r.prixTotal, typeof r.prixTotal);
    console.log("addedPrix reçu:", req.body.addedPrix, typeof req.body.addedPrix);
    console.log("addedDuree reçu:", req.body.addedDuree, typeof req.body.addedDuree);
    console.log("body complet:", req.body);
    if (!r) {
      return res.status(404).json({ success: false, message: "Réservation introuvable" });
    }

    const {
      newDateFin,
      dateFin,
      newHeureFin,
      heureFin,
      addedDuree,
      addedPrix,
      checkOnly,
      acceptUpsellSize
    } = req.body;

    const finalDateFin = newDateFin || dateFin;
    const finalHeureFin = newHeureFin || heureFin;

    const oldEnd = new Date(r.dateFin);
    const newEnd = new Date(finalDateFin);

    if (isNaN(newEnd.getTime())) {
      return res.status(400).json({ success: false, message: "Date invalide" });
    }

    if (newEnd <= oldEnd) {
      return res.status(400).json({
        success: false,
        message: "Erreur."
      });
    }

    const Model = CASIER_MODELS[r.ville];
    const taillesOrdre = ["Standard", "Large", "XL"];
    const indexActuel = taillesOrdre.indexOf(r.taille);

    // ----------------------------
    // CAS 1 : même casier libre
    // ----------------------------
    const conflitAncien = await Reservation.findOne({
      ville: r.ville,
      taille: r.taille,
      casierNumero: r.casierNumero,
      casierSection: r.casierSection,
      statut: "payee",
      _id: { $ne: r._id },
      dateDebut: { $lt: newEnd },
      dateFin: { $gt: oldEnd }
    });

    // Vérifier si le casier actuel est en panne ou bloqué
    const casierActuel = await Model.findOne({
      numero: r.casierNumero,
      section: r.casierSection,
    });
    const casierActuelIndisponible =
      casierActuel?.etat === 'en_panne' || casierActuel?.etat === 'bloque';

    if (!conflitAncien && !casierActuelIndisponible) {
      if (checkOnly) {
        return res.json({
          success: true,
          option: "SAME_LOCKER",
          casierNumero: r.casierNumero,  
    casierSection: r.casierSection, 
          sameLocker: true,
          addedPrix
        });
      }

      await Reservation.findByIdAndUpdate(r._id, {
        dateFin: newEnd,
        heureFin: finalHeureFin,
        duree: r.duree + addedDuree,
        prixTotal: r.prixTotal +addedPrix,
        codeActif: true,
        statut: "payee"
      });

      const updated = await Reservation.findById(r._id);

      return res.json({
        success: true,
        option: "SAME_LOCKER",
        sameLocker: true,
        code: updated.code,
        prixTotal: updated.prixTotal
      });
    }

    // ----------------------------
    // CAS 2 : autre casier même taille
    // ----------------------------
    const casiers = await Model.find({
      taille: r.taille,
      etat: { $nin: ['en_panne', 'bloque'] },
    });

    const occupes = await Reservation.find({
      ville: r.ville,
      taille: r.taille,
      statut: "payee",
      dateDebut: { $lt: newEnd },
      dateFin: { $gt: oldEnd }
    }).select("casierNumero casierSection");

    const setOcc = new Set(
      occupes.map(c => `${c.casierNumero}_${c.casierSection}`)
    );

    const libre = casiers.find(
      c => !setOcc.has(`${c.numero}_${c.section}`)
    );

    if (libre) {
      if (checkOnly) {
        return res.json({
          success: true,
          option: "SAME_SIZE_DIFF_LOCKER",
          casierNumero: libre.numero,    
    casierSection: libre.section,
          sameLocker: false,
          addedPrix
        });
      }

      return await assignerNouveauCasier(
        r,
        libre,
        r.taille,
        r.prixTotal + addedPrix,
        oldEnd,
        newEnd,
        finalHeureFin,
         r.duree + addedDuree,
        Model,
        res,
        false
      );
    }

    // ----------------------------
    // CAS 3 : upsell
    // ----------------------------
    for (let i = indexActuel + 1; i < taillesOrdre.length; i++) {
      const tailleCible = taillesOrdre[i];

      const casiersCible = await Model.find({
        taille: tailleCible,
        etat: { $nin: ['en_panne', 'bloque'] },
      });

      const occ = await Reservation.find({
        ville: r.ville,
        taille: tailleCible,
        statut: "payee",
        dateDebut: { $lt: newEnd },
        dateFin: { $gt: oldEnd }
      }).select("casierNumero casierSection");

      const set = new Set(
        occ.map(c => `${c.casierNumero}_${c.casierSection}`)
      );

      const libreCible = casiersCible.find(
        c => !set.has(`${c.numero}_${c.section}`)
      );

      if (libreCible) {
        const prixBase = PRIX_EXTENSION[tailleCible] || 12;
        const prixFinal = Math.round(prixBase * addedDuree* 0.85) + 3000;

        if (acceptUpsellSize === tailleCible) {
          return await assignerNouveauCasier(
            r,
            libreCible,
            tailleCible,
            prixFinal,
            oldEnd,
            newEnd,
            finalHeureFin,
            addedDuree,
            Model,
            res,
            true
          );
        }

        return res.status(409).json({
          success: false,
          type: "UPSELL_REQUIRED",
          proposedSize: tailleCible,
          proposedPrice: prixFinal
        });
      }
    }

    return res.status(409).json({
      success: false,
      message: "Aucun casier disponible."
    });

  } catch (err) {
    console.error("Erreur prolongation:", err);
    res.status(500).json({ success: false });
  }
});
// ─────────────────────────────────────────────
// POST vérifier code (ESP32)
// ─────────────────────────────────────────────
router.post("/reservations/verifier-code", async (req, res) => {
  try {
    const { code } = req.body;
    console.log("Code reçu:", code);

    const reservation = await Reservation.findOne({
      taille:        "Standard",
      casierNumero:  1,
      casierSection: "A",
      ville:         "sousse",
      code,
      codeActif:     true
    });

    if (!reservation) {
      console.log("Réponse : code invalide");
      return res.json({ valid: false });
    }

    console.log("Réponse : Ouverture de porte");
    return res.json({
      valid:         true,
      reservationId: reservation._id,
      casierNumero:  reservation.casierNumero,
      casierSection: reservation.casierSection,
      user:          reservation.user
    });

  } catch (error) {
    console.log("Erreur serveur:", error);
    return res.status(500).json({ valid: false });
  }
});
// ─────────────────────────────────────────────
// POST fraude (ESP32)
// ─────────────────────────────────────────────
router.post("/reservations/alarme", async (req, res) => {
  try {
    const { deviceId } = req.body;
    const match         = deviceId?.match(/^([A-Z])(\d+)_(.+)$/);
    const casierSection = match ? match[1] : req.body.casierSection || "?";
    const casierNumero  = match ? parseInt(match[2]) : req.body.casierNumero || null;
    const ville         = match ? match[3] : req.body.ville || "?";

    await Fraude.create({ deviceId, casierNumero, casierSection, ville, message: "Tentative de fraude" });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// POST coffre ouvert (ESP32)
// ─────────────────────────────────────────────
router.post("/reservations/coffre-ouvert", async (req, res) => {
  try {
    const { deviceId, casierSection, casierNumero, ville, coffreOuvert } = req.body;
    const Model = CASIER_MODELS[ville?.toLowerCase()];
    if (!Model) return res.status(400).json({ success: false });

    // ✅ Mettre à jour le casier
    await Model.findOneAndUpdate(
      { section: casierSection, numero: casierNumero },
      { $set: { coffreOuvert: true } }
    );

    // ✅ Créer l'alerte dans la collection fraudes
    await Fraude.create({
      deviceId,
      casierNumero,
      casierSection,
      ville,
      message: "Coffre ouvert",   // doit matcher exactement ce que le front attend
      createdAt: new Date(),
    });

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// POST coffre fermé (ESP32)
// ─────────────────────────────────────────────
router.post("/reservations/coffre-ferme", async (req, res) => {
  try {
    const { casierSection, casierNumero, ville } = req.body;
    const Model = CASIER_MODELS[ville?.toLowerCase()];
    if (!Model) return res.status(400).json({ success: false });
    await Model.findOneAndUpdate(
      { section: casierSection, numero: casierNumero },
      { $set: { coffreOuvert: false } }
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// GET fraudes
// ─────────────────────────────────────────────
router.get("/fraudes", async (req, res) => {
  try {
    const fraudes = await Fraude.find().sort({ createdAt: -1 });
    res.json(fraudes);
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// GET réservations user
// ─────────────────────────────────────────────
router.get("/reservations/user/:userId", async (req, res) => {
  try {
    const reservations = await Reservation.find({ user: req.params.userId })
      .sort({ createdAt: -1 });
    res.json({ success: true, reservations });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// GET toutes réservations (admin)
// ─────────────────────────────────────────────
router.get("/reservations", async (req, res) => {
  try {
    const reservations = await Reservation.find()
      .populate("user", "-password")
      .sort({ createdAt: -1 });
    res.json({ success: true, reservations });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// ✅ UN SEUL module.exports à la fin
module.exports = router;