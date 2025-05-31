// ✅ IMPORTS
const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './public/yes')));

// ✅ Firebase Initialisatie
const serviceAccount = require('./public/yes/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ✅ Middleware voor API-key controle
async function authenticateApiKey(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (!apiKey) return res.status(401).json({ message: 'API key ontbreekt' });

  const snapshot = await db.collection('apiKeys').where('apiKey', '==', apiKey).get();
  if (snapshot.empty) return res.status(403).json({ message: 'Ongeldige API key' });

  req.userId = snapshot.docs[0].id;
  next();
}

// ✅ API key genereren
app.post('/api/apikey/generate', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId is verplicht' });

  try {
    const apiKey = crypto.randomUUID();
    await db.collection('apiKeys').doc(userId).set({ apiKey });
    res.status(201).json({ apiKey });
  } catch (err) {
    res.status(500).json({ message: 'Fout bij opslaan API key' });
  }
});

// ✅ Melding aanmaken
app.post('/api/meldingen', authenticateApiKey, async (req, res) => {
  const melding = req.body;
  if (!melding.type || !melding.location || !melding.playerName) return res.status(400).json({ message: 'Fout: ongeldige melding' });

  melding.timestamp = Date.now();
  melding.status = "new";
  melding.userId = req.userId;

  await db.collection('meldingen').add(melding);
  res.status(201).json({ message: '✅ Melding ontvangen', data: melding });
});

// ✅ Meldingen ophalen
app.get('/api/meldingen', authenticateApiKey, async (req, res) => {
  const snapshot = await db.collection('meldingen').where('userId', '==', req.userId).get();
  const meldingen = snapshot.docs.map(doc => doc.data());
  res.json(meldingen);
});

// ✅ Meldingstatus bijwerken
app.patch('/api/meldingen/:timestamp/status', authenticateApiKey, async (req, res) => {
  const { timestamp } = req.params;
  const { status } = req.body;

  if (!["new", "accepted", "assigned", "closed"].includes(status)) return res.status(400).json({ message: 'Ongeldige status' });

  const snapshot = await db.collection('meldingen').where('timestamp', '==', Number(timestamp)).where('userId', '==', req.userId).get();
  if (snapshot.empty) return res.status(404).json({ message: 'Melding niet gevonden' });

  const docRef = snapshot.docs[0].ref;
  await docRef.update({ status });

  res.json({ message: 'Status bijgewerkt', status });
});

// ✅ Eenheid toevoegen of bijwerken
app.post('/api/units', authenticateApiKey, async (req, res) => {
  const unit = req.body;
  if (!unit.id || !unit.type || !unit.location) return res.status(400).json({ message: 'Ongeldige eenheid' });

  unit.userId = req.userId;
  await db.collection('units').add(unit);
  res.status(200).json({ message: 'Eenheid opgeslagen', data: unit });
});

// ✅ Eenheden ophalen
app.get('/api/units', authenticateApiKey, async (req, res) => {
  const snapshot = await db.collection('units').where('userId', '==', req.userId).get();
  const eenheden = snapshot.docs.map(doc => doc.data());
  res.json(eenheden);
});

// ✅ Amber Alert opslaan
app.post('/api/amber', authenticateApiKey, async (req, res) => {
  const { name, location, description, timestamp } = req.body;
  if (!name || !location || !description || !timestamp) return res.status(400).json({ error: 'Ontbrekende velden' });

  const alert = { name, location, description, timestamp, userId: req.userId };
  await db.collection('amberAlerts').add(alert);
  res.status(201).json({ message: 'Amber Alert opgeslagen', alert });
});

// ✅ Amber Alerts ophalen
app.get('/api/amber', authenticateApiKey, async (req, res) => {
  const snapshot = await db.collection('amberAlerts').where('userId', '==', req.userId).get();
  const alerts = snapshot.docs.map(doc => doc.data());
  res.json(alerts);
});

// ✅ NL Alert opslaan
app.post('/api/nlalert', authenticateApiKey, async (req, res) => {
  const { title, message, location, timestamp } = req.body;
  if (!title || !message || !location || !timestamp) return res.status(400).json({ error: 'Ontbrekende velden voor NLAlert' });

  const alert = { title, message, location, timestamp, userId: req.userId };
  await db.collection('nlAlerts').add(alert);
  res.status(201).json({ message: 'NLAlert opgeslagen', alert });
});

// ✅ NL Alerts ophalen
app.get('/api/nlalert', authenticateApiKey, async (req, res) => {
  const snapshot = await db.collection('nlAlerts').where('userId', '==', req.userId).get();
  const alerts = snapshot.docs.map(doc => doc.data());
  res.json(alerts);
});

// ✅ ANPR trigger opslaan
app.post('/api/anpr', authenticateApiKey, async (req, res) => {
  const { plate, location } = req.body;
  if (!plate || !location) return res.status(400).json({ message: 'Plate of locatie ontbreekt' });

  const verdachtePlaten = ['XX-123-X', '99-ABC-1', '00-POL-911'];
  const isVerdacht = verdachtePlaten.includes(plate.toUpperCase());

  if (isVerdacht) {
    const melding = {
      id: Date.now().toString(),
      type: 'Verdacht voertuig',
      location,
      description: `ANPR hit op kenteken: ${plate}`,
      playerName: 'ANPR Systeem',
      userId: req.userId,
      timestamp: Date.now(),
      status: 'new',
      coordinates: { x: 100, y: 100, z: 0 }
    };
    await db.collection('meldingen').add(melding);
    return res.status(201).json({ message: 'Verdacht voertuig gemeld', data: melding });
  }

  res.status(200).json({ message: 'Kenteken gescand, geen hit' });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
