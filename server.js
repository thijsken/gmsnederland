const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function requireServerId(req, res, next) {
  const serverId = req.headers['x-server-id'];
  if (!serverId) return res.status(400).json({ error: 'X-Server-Id header ontbreekt' });
  req.serverId = serverId;
  next();
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Geen token gegeven' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token ontbreekt' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    console.error('Token verificatie mislukt:', err);
    res.status(403).json({ error: 'Ongeldig token' });
  }
}

function collectionPath(serverId, collection) {
  return `servers/${serverId}/${collection}`;
}

// === Meldingen ===

// POST melding
app.post('/api/meldingen', requireServerId, async (req, res) => {
  const melding = req.body;
  if (!melding || !melding.type || !melding.location || !melding.playerName) {
    return res.status(400).json({ message: 'Ongeldige melding' });
  }
  melding.timestamp = Date.now();
  melding.status = 'new';
  melding.serverId = req.serverId;

  try {
    const docRef = await db.collection(collectionPath(req.serverId, 'meldingen')).add(melding);
    const savedMelding = (await docRef.get()).data();
    res.status(201).json({ message: 'Melding opgeslagen', id: docRef.id, data: savedMelding });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// GET meldingen voor ingelogde user
app.get('/api/meldingen', requireServerId, authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.collection(collectionPath(req.serverId, 'meldingen'))
      .where('userId', '==', req.user.uid)
      .get();

    const meldingen = [];
    snapshot.forEach(doc => meldingen.push({ id: doc.id, ...doc.data() }));
    res.json(meldingen);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// PATCH status melding
app.patch('/api/meldingen/:id/status', requireServerId, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["new", "accepted", "assigned", "closed"].includes(status)) {
    return res.status(400).json({ message: 'Ongeldige status' });
  }

  try {
    const docRef = db.collection(collectionPath(req.serverId, 'meldingen')).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ message: 'Melding niet gevonden' });

    await docRef.update({ status });
    const updated = await docRef.get();
    res.json({ message: 'Status bijgewerkt', melding: { id: updated.id, ...updated.data() } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// === Eenheden ===

app.post('/api/units', requireServerId, async (req, res) => {
  const unit = req.body;
  if (!unit || !unit.id || !unit.type || !unit.location) {
    return res.status(400).json({ message: 'Ongeldige eenheid' });
  }

  try {
    const docRef = db.collection(collectionPath(req.serverId, 'eenheden')).doc(unit.id);
    await docRef.set(unit, { merge: true });
    res.status(200).json({ message: 'Eenheid opgeslagen', data: unit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

app.get('/api/units', requireServerId, async (req, res) => {
  try {
    const snapshot = await db.collection(collectionPath(req.serverId, 'eenheden')).get();
    const eenheden = [];
    snapshot.forEach(doc => eenheden.push({ id: doc.id, ...doc.data() }));
    res.json(eenheden);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// === Luchtalarm Palen ===

app.post('/api/luchtalarm/palen', requireServerId, async (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ message: 'Ongeldige paaldata' });

  try {
    // Sla alle palen op als losse docs met unieke id's, of 1 document met array.
    // Hier 1 document per server met array (overwrites)
    await db.collection('servers').doc(req.serverId).set({ luchtalarmPalen: data }, { merge: true });
    res.json({ message: 'Paaldata opgeslagen' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

app.get('/api/luchtalarm/palen', requireServerId, async (req, res) => {
  try {
    const doc = await db.collection('servers').doc(req.serverId).get();
    const luchtalarmPalen = doc.exists && doc.data().luchtalarmPalen ? doc.data().luchtalarmPalen : [];
    res.json(luchtalarmPalen);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// === Luchtalarm Actie ===

app.post('/api/luchtalarm/actie', requireServerId, async (req, res) => {
  const { actie, id } = req.body;
  if (!actie || !id) return res.status(400).json({ message: 'Actie of ID ontbreekt' });

  try {
    const actieDoc = {
      actie,
      id,
      timestamp: Date.now()
    };
    await db.collection('servers').doc(req.serverId).set({ laatsteLuchtalarmActie: actieDoc }, { merge: true });
    res.status(200).json({ message: `Actie '${actie}' uitgevoerd op paal '${id}'` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

app.get('/api/luchtalarm/actie', requireServerId, async (req, res) => {
  try {
    const docRef = db.collection('servers').doc(req.serverId);
    const doc = await docRef.get();

    if (!doc.exists || !doc.data().laatsteLuchtalarmActie) {
      return res.status(204).send();
    }

    const actie = doc.data().laatsteLuchtalarmActie;
    // Verwijder na uitlezen (reset)
    await docRef.update({ laatsteLuchtalarmActie: admin.firestore.FieldValue.delete() });

    res.json(actie);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// === Posten ===

app.post('/api/posten', requireServerId, async (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ message: 'Ongeldige posten-data' });

  try {
    await db.collection('servers').doc(req.serverId).set({ posten: data }, { merge: true });
    res.json({ message: 'Posten opgeslagen' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

app.get('/api/posten', requireServerId, async (req, res) => {
  try {
    const doc = await db.collection('servers').doc(req.serverId).get();
    const posten = doc.exists && doc.data().posten ? doc.data().posten : [];
    res.json(posten);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// Posten alarm triggeren (laatste alarm)
app.post('/api/posten/alarm', requireServerId, async (req, res) => {
  const { postId, trigger, omroep, adres, info, voertuig } = req.body;
  if (!postId || !trigger || !voertuig) return res.status(400).json({ message: 'postId, trigger en voertuig zijn verplicht' });

  const alarmData = {
    postId,
    trigger,
    omroep: omroep || false,
    adres: adres || "Geen adres",
    info: info || "Geen info",
    voertuig,
    timestamp: Date.now()
  };

  try {
    await db.collection('servers').doc(req.serverId).set({ lastPostAlarm: alarmData }, { merge: true });
    res.status(200).json({ message: 'Alarm opgeslagen', data: alarmData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

app.get('/api/posten/alarm', requireServerId, async (req, res) => {
  try {
    const docRef = db.collection('servers').doc(req.serverId);
    const doc = await docRef.get();

    if (!doc.exists || !doc.data().lastPostAlarm) return res.json({});

    const alarm = doc.data().lastPostAlarm;
    await docRef.update({ lastPostAlarm: admin.firestore.FieldValue.delete() });

    res.json(alarm);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// === Amber Alerts ===

app.post('/api/amber', requireServerId, async (req, res) => {
  const alert = req.body;
  if (!alert.name || !alert.userId || !alert.location || !alert.description || !alert.timestamp) {
    return res.status(400).json({ error: "Ontbrekende velden" });
  }

  try {
    const amberRef = db.collection(collectionPath(req.serverId, 'amberAlerts'));
    await amberRef.add(alert);
    res.status(201).json({ message: "Amber Alert opgeslagen", alert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Interne serverfout' });
  }
});

app.get('/api/amber', requireServerId, async (req, res) => {
  try {
    const snapshot = await db.collection(collectionPath(req.serverId, 'amberAlerts')).get();
    const alerts = [];
    snapshot.forEach(doc => alerts.push({ id: doc.id, ...doc.data() }));
    res.json(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Interne serverfout' });
  }
});

// === NLAlerts ===

app.post('/api/nlalert', requireServerId, async (req, res) => {
  const { title, message, location, timestamp } = req.body;
  if (!title || !message || !location || !timestamp) {
    return res.status(400).json({ error: "Ontbrekende velden voor NLAlert" });
  }

  try {
    const nlRef = db.collection(collectionPath(req.serverId, 'nlAlerts'));
    const alert = { title, message, location, timestamp };
    await nlRef.add(alert);
    res.status(201).json({ message: "NLAlert opgeslagen", alert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Interne serverfout' });
  }
});

app.get('/api/nlalert', requireServerId, async (req, res) => {
  try {
    const snapshot = await db.collection(collectionPath(req.serverId, 'nlAlerts')).get();
    const alerts = [];
    snapshot.forEach(doc => alerts.push({ id: doc.id, ...doc.data() }));
    res.json(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Interne serverfout' });
  }
});

// === ANPR ===

app.post('/api/anpr', requireServerId, async (req, res) => {
  const { plate, location } = req.body;
  if (!plate || !location) return res.status(400).json({ message: 'Plate of locatie ontbreekt' });

  try {
    const anprRef = db.collection(collectionPath(req.serverId, 'anpr'));
    await anprRef.add({
      plate,
      location,
      timestamp: Date.now(),
    });
    res.status(201).json({ message: 'ANPR opgeslagen' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

app.get('/api/anpr', requireServerId, async (req, res) => {
  try {
    const snapshot = await db.collection(collectionPath(req.serverId, 'anpr')).get();
    const entries = [];
    snapshot.forEach(doc => entries.push({ id: doc.id, ...doc.data() }));
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Interne serverfout' });
  }
});

// === Server start ===

app.listen(PORT, () => {
  console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
