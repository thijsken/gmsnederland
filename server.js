const admin = require('firebase-admin');
const serviceAccount = require('./public/serviceAccountKey.json'); // pas aan naar jouw bestand

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://gmsnederland-3029e-default-rtdb.europe-west1.firebasedatabase.app' // pas aan naar jouw database URL
});

const db = admin.database();

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
let alarmQueue = [];
let laatsteLuchtalarmActie = null;
let lastPostAlarm = null;

// 🌍 Dashboard root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 📥 POST: Melding ontvangen
app.post('/api/meldingen', (req, res) => {
  const { serverId, type, location, playerName } = req.body;

  if (!serverId || !type || !location || !playerName) {
    return res.status(400).json({ message: 'Fout: ongeldige melding of geen serverId' });
  }

  const melding = {
    type,
    location,
    playerName,
    timestamp: Date.now(),
    status: "new"
  };

  // Opslaan in Firebase onder per server path
  const ref = db.ref(`servers/${serverId}/meldingen`);
  ref.push(melding)
    .then(() => {
      console.log(`📥 Nieuwe melding opgeslagen voor server ${serverId}`, melding);
      res.status(201).json({ message: '✅ Melding ontvangen en opgeslagen', data: melding });
    })
    .catch(error => {
      console.error('Fout bij opslaan melding:', error);
      res.status(500).json({ message: 'Fout bij opslaan melding' });
    });
});


// 📤 GET: Alle meldingen ophalen
app.get('/api/meldingen', (req, res) => {
  const serverId = req.query.serverId;
  if (!serverId) {
    return res.status(400).json({ message: 'serverId is verplicht' });
  }

  const ref = db.ref(`servers/${serverId}/meldingen`);
  ref.once('value')
    .then(snapshot => {
      const data = snapshot.val() || {};
      // Omdat data een object is van keys => values, kun je het omzetten naar array:
      const meldingen = Object.values(data);
      res.json(meldingen);
    })
    .catch(error => {
      console.error('Fout bij ophalen meldingen:', error);
      res.status(500).json({ message: 'Fout bij ophalen meldingen' });
    });
});

app.patch('/api/meldingen/:meldingId/status', async (req, res) => {
  const { meldingId } = req.params;
  const { status } = req.body;

  if (!["new", "accepted", "assigned", "closed"].includes(status)) {
    return res.status(400).json({ message: 'Ongeldige status' });
  }

  try {
    const ref = db.ref(`servers/${req.query.serverId}/meldingen/${meldingId}`);
    const snapshot = await ref.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'Melding niet gevonden' });
    }
    await ref.update({ status });
    const updated = await ref.once('value');
    res.json({ message: 'Status bijgewerkt', melding: updated.val() });
  } catch (error) {
    console.error('Fout bij updaten status melding:', error);
    res.status(500).json({ message: 'Fout bij updaten status' });
  }
});

// ✅ POST: Eenheid aanmaken of bijwerken
app.post('/api/units', (req, res) => {
  const { serverId, id, type, location } = req.body;

  if (!serverId || !id || !type || !location) {
    return res.status(400).json({ message: 'Ongeldige eenheid of geen serverId' });
  }

  const ref = db.ref(`servers/${serverId}/units/${id}`);
  const unit = { id, type, location };

  ref.set(unit)
    .then(() => {
      res.status(200).json({ message: 'Eenheid opgeslagen', data: unit });
    })
    .catch(error => {
      console.error('Fout bij opslaan unit:', error);
      res.status(500).json({ message: 'Fout bij opslaan unit' });
    });
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

  posten.push(alarmData);
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

// ✅ POST: ANPR-trigger vanaf Roblox
app.post('/api/anpr', (req, res) => {
  const { plate, location } = req.body;

  if (!plate || !location) {
    return res.status(400).json({ message: 'Plate of locatie ontbreekt' });
  }

  const verdachtePlaten = ['XX-123-X', '99-ABC-1', '00-POL-911'];
  const isVerdacht = verdachtePlaten.includes(plate.toUpperCase());

  if (isVerdacht) {
    const melding = {
      id: Date.now().toString(),
      type: 'Verdacht voertuig',
      location,
      description: `ANPR hit op kenteken: ${plate}`,
      playerName: 'ANPR Systeem',
      userId: 0,
      timestamp: Date.now(),
      status: 'new',
      coordinates: { x: 100, y: 100, z: 0 } // eventueel dynamisch maken
    };
    meldingen.push(melding);
    console.log(`🚨 ANPR HIT - Melding aangemaakt voor kenteken ${plate}`);
    return res.status(201).json({ message: 'Verdacht voertuig gemeld', data: melding });
  }

  res.status(200).json({ message: 'Kenteken gescand, geen hit' });
});


// Get: Alle NLAlerts ophalen
app.get('/api/nlalert', (req, res) => {
  res.json(nlAlerts);
})
// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
