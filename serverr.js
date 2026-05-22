const express = require("express");
const cors    = require("cors");
const bcrypt  = require("bcrypt");

require("./config/connect.js");

const app = express();

// ===== CORS =====
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://unprolific-jeraldine-overcasually.ngrok-free.dev"
  ],
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options(/.*/, cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== MODELS =====
const User           = require("./models/user.js");
const CasierSousse   = require("./models/casierSousse.js");
const CasierMonastir = require("./models/casierMonastir.js");
const CasierMahdia   = require("./models/casierMahdia.js");

const CASIER_MODELS = {
  sousse:   CasierSousse,
  monastir: CasierMonastir,
  mahdia:   CasierMahdia,
};

// ===== ROUTES =====
const reservationRoutes = require("./reservationRoutes.js");
const regionRoutes      = require("./regionRoutes.js");
const reclamationRoutes = require("./reclamationRoutes.js");
const feedbackRoutes    = require("./feedbackRoutes.js");

app.use("/", regionRoutes);
app.use("/", reservationRoutes);
app.use("/", reclamationRoutes);
app.use("/", feedbackRoutes);

// ===== HELPERS =====
const formatDtn = (date) => {
  if (!date) return "";
  const d     = new Date(date);
  const day   = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year  = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
};


// ===== REGISTER =====
app.post("/register", async (req, res) => {
  try {
    const { name, lastname, dtn, tel, email, cin, password } = req.body;

    const [day, month, year] = dtn.split("/");
    const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Email invalide" });

    if (await User.findOne({ cin }))
      return res.status(400).json({ message: "CIN invalide" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name, lastname, dtn: parsedDate, tel, email, cin,
      password: hashedPassword,
    });
    await newUser.save();

    res.status(201).json({
      success: true,
      message: "Enregistre avec succes",
      user: {
        id:       newUser._id,
        name:     newUser.name,
        lastname: newUser.lastname,
        dtn:      formatDtn(newUser.dtn),
        email:    newUser.email,
        cin:      newUser.cin,
        tel:      newUser.tel,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Erreur inscription" });
  }
});

// ===== MODIFIER USER =====
app.put("/modifier/:id", async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.dtn && body.dtn.includes('/')) {
      const [day, month, year] = body.dtn.split('/');
      body.dtn = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
    if (body.password) {
      body.password = await bcrypt.hash(body.password, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!updatedUser)
      return res.status(404).json({ success: false, message: "Utilisateur introuvable" });

    res.json({
      success: true,
      user: {
        id:       updatedUser._id,
        name:     updatedUser.name,
        lastname: updatedUser.lastname,
        email:    updatedUser.email,
        ville:    updatedUser.ville,
        tel:      updatedUser.tel,
        cin:      updatedUser.cin || "",
        dtn:      formatDtn(updatedUser.dtn),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== LOGIN MOBILE =====
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Champs requis" });

    const findUser = await User.findOne({ email });
    if (!findUser)
      return res.status(401).json({ success: false, message: "Utilisateur non trouvé" });

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    if (!passwordMatch)
      return res.status(401).json({ success: false, message: "Mot de passe invalide" });

    res.status(200).json({
      success: true,
      message: "Authentification reussie",
      user: {
        id:       findUser._id,
        name:     findUser.name,
        lastname: findUser.lastname,
        dtn:      formatDtn(findUser.dtn),
        email:    findUser.email,
        ville:    findUser.ville,
        tel:      findUser.tel,
        cin:      findUser.cin || "",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur connexion" });
  }
});

// ===== LOGIN ADMIN =====
const admins = [
  { name: "Amal",  lastname: "Laadhari", email: "amal@gmail.com",  password: "Amal123&",   cin: "12345678" },
  { name: "flen",  lastname: "foulen",   email: "foulen@gmail.com", password: "Foulen123&", cin: "87654321" },
  { name: "kamel", lastname: "ldh",      email: "kamel@gmail.com",  password: "Kamel123&",  cin: "22555666" },
];

app.post("/login-admin", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ success: false, message: "Champs requis" });

  const foundAdmin = admins.find(a => a.email === email);
  if (!foundAdmin)
    return res.status(401).json({ success: false, message: "Admin introuvable" });

  if (foundAdmin.password !== password)
    return res.status(401).json({ success: false, message: "Mot de passe invalide" });

  res.status(200).json({
    success: true,
    message: "Authentification reussie",
    user: {
      name:     foundAdmin.name,
      lastname: foundAdmin.lastname,
      email:    foundAdmin.email,
    },
  });
});

// ===== USERS =====
app.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json({ success: true, users });
  } catch {
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.put("/users/:id/ville", async (req, res) => {
  try {
    const { ville } = req.body;
    await User.findByIdAndUpdate(req.params.id, { ville });
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

app.delete("/users/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Utilisateur supprime" });
  } catch {
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// ===== INIT CASIERS =====
const initCasiers = async () => {
  const tailles = [
    { nums: [1, 2, 3, 4],    taille: "Standard" },
    { nums: [5, 6, 7, 8],    taille: "Large"    },
    { nums: [9, 10, 11, 12], taille: "XL"       },
  ];
  const sections = ["A", "B"];

  for (const [regionKey, Model] of Object.entries(CASIER_MODELS)) {
    for (const section of sections) {
      
      const count = await Model.countDocuments({ section });
      if (count === 0) {
        const casiers = [];
        tailles.forEach(({ nums, taille }) => {
          nums.forEach(numero => {
            casiers.push({ numero, section, taille, etat: "disponible", reserve: false, cinUser: "" });
          });
        });
        await Model.insertMany(casiers);
        console.log(`12 casiers section ${section} initialisés pour ${regionKey}`);
      }
    }
  }
};

// ===== SERVER =====
const port = process.env.PORT || 3001;

app.listen(port, "0.0.0.0", async () => {
  await initCasiers();
  console.log(`Serveur démarré sur le port: ${port}`);
});