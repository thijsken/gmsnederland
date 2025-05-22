const express = require('express');
const path = require('path');
const cors = require('cors');
const { error } = require('console');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🧠 Tijdelijke opslag
let meldingen = [];
let eenheden = [];
let luchtalarmPalen = [];
let posten = [];
let amberAlerts = [];
let nlAlerts = [];
let laatsteLuchtalarmActie = null;
let lastPostAlarm = null;

// 🌍 Dashboard root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 📥 POST: Melding ontvangen
app.post('/api/meldingen', (req, res) => {
  const melding = req.body;
  if (!melding || !melding.type || !melding.location || !melding.playerName) {
    return res.status(400).json({ message: 'Fout: ongeldige melding' });
  }

  melding.timestamp = Date.now();
  meldingen.push(melding);
  console.log('📥 Nieuwe melding ontvangen:', melding);

  res.status(201).json({ message: '✅ Melding ontvangen', data: melding });
});

// 📤 GET: Alle meldingen ophalen
app.get('/api/meldingen', (req, res) => {
  res.json(meldingen);
});

// ✅ POST: Eenheid aanmaken of bijwerken
app.post('/api/units', (req, res) => {
  const unit = req.body;

  if (!unit || !unit.id || !unit.type || !unit.location) {
    return res.status(400).json({ message: 'Ongeldige eenheid' });
  }

  const index = eenheden.findIndex(u => u.id === unit.id);
  if (index !== -1) {
    eenheden[index] = unit;
  } else {
    eenheden.push(unit);
  }

  res.status(200).json({ message: 'Eenheid bijgewerkt', data: unit });
});

// ✅ GET: Alle eenheden ophalen
app.get('/api/units', (req, res) => {
  res.json(eenheden);
});

// ✅ POST: Luchtalarm-palen ontvangen vanuit Roblox
app.post('/api/luchtalarm/palen', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) {
    return res.status(400).json({ message: 'Ongeldige paaldata' });
  }

  luchtalarmPalen = data;
  console.log("📥 Paaldata ontvangen:", luchtalarmPalen.length);
  res.json({ message: 'Paaldata opgeslagen' });
});

// ✅ GET: Luchtalarm-palen ophalen
app.get('/api/luchtalarm/palen', (req, res) => {
  res.json(luchtalarmPalen);
});

// ✅ POST: Actie instellen voor luchtalarm
app.post('/api/luchtalarm/actie', (req, res) => {
  const { actie, id } = req.body;
  if (!actie || !id) {
    return res.status(400).json({ message: 'Actie of ID ontbreekt' });
  }

  laatsteLuchtalarmActie = { actie, id, timestamp: Date.now() };
  console.log(`🚨 Actie '${actie}' ontvangen voor paal '${id}'`);
  res.status(200).json({ message: `Actie '${actie}' uitgevoerd op paal '${id}'` });
});

// ✅ GET: Ophalen luchtalarm-actie door Roblox
app.get('/api/luchtalarm/actie', (req, res) => {
  if (!laatsteLuchtalarmActie) {
    return res.status(204).send();
  }

  const actie = laatsteLuchtalarmActie.actie;
  laatsteLuchtalarmActie = null;
  console.log(`📡 Roblox haalt actie op: ${actie}`);
  res.json({ actie });
});

// ✅ POST: Posten ontvangen vanuit Roblox
app.post('/api/posten', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) {
    return res.status(400).json({ message: 'Ongeldige posten-data' });
  }

  posten = data;
  console.log('📥 Posten ontvangen:', posten.length);
  res.json({ message: 'Posten opgeslagen' });
});

// ✅ GET: Posten ophalen
app.get('/api/posten', (req, res) => {
  res.json(posten);
});

// ✅ POST: Alarm triggeren vanuit dashboard
app.post('/api/posten/alarm', (req, res) => {
  const { postId, trigger, omroep, adres, info, voertuig } = req.body;

  if (!postId || !trigger || !voertuig) {
    return res.status(400).json({ message: 'postId, trigger en voertuig zijn verplicht' });
  }

  const alarmData = {
    postId,
    trigger,
    omroep: omroep || false,
    adres: adres || "Geen adres",
    info: info || "Geen info",
    voertuig,
    timestamp: Date.now()
  };

  lastPostAlarm = alarmData;

  console.log('🚨 Alarm opgeslagen:', alarmData);
  res.status(200).json({ message: '✅ Alarm opgeslagen', data: alarmData });
});

// ✅ GET: Laat Roblox het alarm ophalen
app.get('/api/posten/alarm', (req, res) => {
  const data = lastPostAlarm;
  lastPostAlarm = null; // reset na uitlezen
  res.json(data || {});
});

app.post('/api/amber', (req, res) => {
  const { name, userId, location, description, timestamp } = req.body;

  if (!name || !userId || !location || !description || !timestamp) {
    return res.status(400).json({ error: "Ontbrekende velden" });
  }

  const alert = { name, userId, location, description, timestamp };
  amberAlerts.push(alert);

  console.log("✅ Amber Alert opgeslagen:", alert);

  res.status(201).json({ message: "Amber Alert opgeslagen", alert });
});

app.get('/api/amber', (req, res) => {
  res.json(amberAlerts);
});


// ✅ POST: NLAlert verzenden
app.post('/api/nlalert', (req, res) => {
  const { title, message, location, timestamp } = req.body;

  if (!title || !message || !location || !timestamp) {
    return res.status(400).json({ error: "Ontbrekende velden voor NLAlert" });
  }

  const alert = { title, message, location, timestamp };
  nlAlerts.push(alert);

  console.log("📢 NLAlert opgeslagen:", alert);

  res.status(201).json({ message: "NLAlert opgeslagen", alert });
});

// Get: Alle NLAlerts ophalen
app.get('/api/nlalert', (req, res) => {
  res.json(nlAlerts);
})
// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
