const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

// Firebase Admin SDK initialiseren
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware: Firebase-token verifiëren
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Geen geldig token opgegeven' });
  }
  const idToken = authHeader.replace('Bearer ', '');

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = { uid: decodedToken.uid, email: decodedToken.email };
    next();
  } catch (error) {
    console.error('Tokenverificatie mislukt:', error);
    return res.status(401).json({ message: 'Tokenverificatie mislukt' });
  }
}

// Middleware: API-key validatie
async function requireApiKey(req, res, next) {
  const apiKey = req.header('X-API-Key');
  if (!apiKey) return res.status(401).json({ message: 'Geen API-key opgegeven' });

  try {
    const snapshot = await db.collection('apiKeys').where('apiKey', '==', apiKey).limit(1).get();
    if (snapshot.empty) return res.status(401).json({ message: 'Ongeldige API-sleutel' });

    const doc = snapshot.docs[0];
    const uid = doc.id;
    const userRecord = await admin.auth().getUser(uid);

    req.user = { uid, email: userRecord.email, apiKey };
    next();
  } catch (err) {
    console.error('Verificatie API-key mislukt:', err);
    res.status(500).json({ message: 'Serverfout bij API-key verificatie' });
  }
}

// Endpoint: Genereer API-key voor ingelogde gebruiker
app.post('/api/generate-key', verifyFirebaseToken, async (req, res) => {
  const apiKey = 'gms_' + crypto.randomBytes(32).toString('hex');

  try {
    await db.collection('apiKeys').doc(req.user.uid).set({
      apiKey,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ apiKey });
  } catch (err) {
    console.error('Fout bij opslaan in Firestore:', err);
    res.status(500).json({ message: 'Fout bij opslaan van API-key' });
  }
});

// Endpoint: Meldingen aanmaken
app.post('/api/meldingen', requireApiKey, async (req, res) => {
  const { type, location, playerName } = req.body;
  if (!type || !location || !playerName) {
    return res.status(400).json({ message: 'Ongeldige melding, ontbrekende velden' });
  }

  const melding = {
    type,
    location,
    playerName,
    timestamp: Date.now(),
    status: 'new',
    ownerId: req.user.uid
  };

  try {
    const docRef = await db.collection('meldingen').add(melding);
    res.status(201).json({ message: 'Melding opgeslagen', id: docRef.id, data: melding });
  } catch (err) {
    console.error('Fout bij opslaan melding:', err);
    res.status(500).json({ message: 'Fout bij opslaan melding' });
  }
});

// Endpoint: Alle meldingen van gebruiker ophalen
app.get('/api/meldingen', requireApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('meldingen')
      .where('ownerId', '==', req.user.uid)
      .orderBy('timestamp', 'desc')
      .get();

    const meldingen = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(meldingen);
  } catch (err) {
    console.error('Fout bij ophalen meldingen:', err);
    res.status(500).json({ message: 'Fout bij ophalen meldingen' });
  }
});

// Endpoint: Status van melding updaten
app.patch('/api/meldingen/:id/status', requireApiKey, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) return res.status(400).json({ message: 'Status is verplicht' });

  try {
    const docRef = db.collection('meldingen').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return res.status(404).json({ message: 'Melding niet gevonden' });

    if (doc.data().ownerId !== req.user.uid)
      return res.status(403).json({ message: 'Geen toegang tot deze melding' });

    await docRef.update({ status });
    res.json({ message: 'Status bijgewerkt', id, status });
  } catch (err) {
    console.error('Fout bij bijwerken status melding:', err);
    res.status(500).json({ message: 'Fout bij bijwerken status melding' });
  }
});

// Endpoint: Eenheid toevoegen of updaten
app.post('/api/units', requireApiKey, async (req, res) => {
  const { id, type, location } = req.body;
  if (!id || !type || !location) {
    return res.status(400).json({ message: 'Ongeldige eenheid, ontbrekende velden' });
  }

  const unit = {
    id,
    type,
    location,
    ownerId: req.user.uid,
    updatedAt: Date.now()
  };

  try {
    const docRef = db.collection('units').doc(`${req.user.uid}_${id}`);
    await docRef.set(unit, { merge: true });
    res.json({ message: 'Eenheid opgeslagen', data: unit });
  } catch (err) {
    console.error('Fout bij opslaan eenheid:', err);
    res.status(500).json({ message: 'Fout bij opslaan eenheid' });
  }
});

// Endpoint: Alle units van gebruiker ophalen
app.get('/api/units', requireApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('units')
      .where('ownerId', '==', req.user.uid)
      .get();

    const units = snapshot.docs.map(doc => doc.data());
    res.json(units);
  } catch (err) {
    console.error('Fout bij ophalen units:', err);
    res.status(500).json({ message: 'Fout bij ophalen units' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
