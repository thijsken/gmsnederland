const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();
const Stripe = require('stripe');
const stripe = Stripe('sk_test_51RUYjVPLQUgW1JNriYW9FWG6YI33hjKKK0OvILsNUhM83uevbUcsqTZnIv96p47L1gNAwwHMtZg8Y1sh3xstSKES00jfzPMuZk'); // <-- Je Secret Key hier
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let meldingen = [];
let posten = [];
let luchtalarmPalen = [];
let laatsteLuchtalarmActie = null;
let lastPostAlarm = null;


// ✅ Firebase Initialisatie
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function authenticateApiKey(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (!apiKey) return res.status(401).json({ message: 'API key ontbreekt' });

  const snapshot = await db.collection('apiKeys').where('apiKey', '==', apiKey).get();
  if (snapshot.empty) return res.status(403).json({ message: 'Ongeldige API key' });

  req.userId = snapshot.docs[0].id; // sla userId op in request
  next();
}


app.post('/create-payment-intent', async (req, res) => {
  const { amount, packageName } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Bedrag in centen
      currency: 'eur',
      payment_method_types: ['ideal'],
      description: `Betaling voor ${packageName}`,
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.listen(4242, () => console.log('Server draait op http://localhost:4242'));

// 🔐 API Key genereren en opslaan
app.post('/api/apikey/generate', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'userId is verplicht' });
  }

  try {
    const apiKey = crypto.randomUUID();
    await db.collection('apiKeys').doc(userId).set({ apiKey });

    console.log(`🔑 API key opgeslagen voor gebruiker ${userId}`);
    res.status(201).json({ apiKey });
  } catch (err) {
    console.error('❌ Fout bij opslaan API key:', err);
    res.status(500).json({ message: 'Fout bij opslaan API key' });
  }
});

// 🌍 Dashboard root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 📥 POST: Melding ontvangen
app.post('/api/meldingen', authenticateApiKey, async (req, res) => {
  const melding = req.body;
  if (!melding.type || !melding.location || !melding.playerName) {
    return res.status(400).json({ message: 'Fout: ongeldige melding' });
  }

  melding.timestamp = Date.now();
  melding.status = "new"; // voeg status toe
  melding.userId = req.userId;
  try {
    await db.collection('meldingen').add(melding);
    console.log('📥 Nieuwe melding ontvangen: ', melding);
    res.status(201).json({ message: '✅ Melding ontvangen', data: melding });
  } catch (err) {
    console.error('Fout bij het opslaan meldingen:', err);
    res.status(500).json({ message: 'Fout bij opslaan melding'});
  }
});
  // meldingen.push(melding);

// 📤 GET: Alle meldingen ophalen
app.get('/api/meldingen', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('meldingen').where('userId', '==', req.userId).get();
    const meldingen = snapshot.docs.map(doc => doc.data());
    res.json(meldingen);
  } catch (err) {
    console.error(' Fout bij ophalen meldingen:', err);
    res.status(500).json({message: 'Fout bij ophalen meldingen' });
  }
});

  // const userMeldingen = meldingen.filter(m => m.userId == req.userId);
  // res.json(userMeldingen);

app.patch('/api/meldingen/:timestamp/status', (req, res) => {
  const { timestamp } = req.params;
  const { status } = req.body;

  console.log(`🔧 PATCH aanvraag ontvangen voor melding ${timestamp} met status "${status}"`);

  if (!["new", "accepted", "assigned", "closed"].includes(status)) {
    console.warn(`❌ Ongeldige status ontvangen: ${status}`);
    return res.status(400).json({ message: 'Ongeldige status' });
  }

  const melding = meldingen.find(m => String(m.timestamp) === timestamp);
  if (!melding) {
    console.warn(`⚠️ Melding met timestamp ${timestamp} niet gevonden`);
    return res.status(404).json({ message: 'Melding niet gevonden' });
  }

  melding.status = status;
  console.log(`✅ Status van melding ${timestamp} succesvol gewijzigd naar "${status}"`);
  res.json({ message: 'Status bijgewerkt', melding });
});


// ✅ POST: Eenheid aanmaken of bijwerken
app.post('/api/units', authenticateApiKey, async (req, res) => {
  const unit = req.body;
  if (!unit || !unit.id || !unit.type || !unit.location) {
    return res.status(400).json({ message: 'Ongeldige eenheid' });
  }
  unit.userId = req.userId;
  try {
    await db.collection('units').add(unit);
    res.status(200).json({ meessage: 'Eenheid opgeslagen', data: unit});
  } catch (err) {
    console.error(' Fout bij opslaan eenheid:', err);
    res.status(500).json({ message: 'Fout bij opslaan eenheid'});
  }
});

// ✅ GET: Alle eenheden ophalen
app.get('/api/units', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('units').where('userid', '==', req.userId).get();
    const eenheden = snapshot.docs.map(doc => doc.data);
    req.json(eenheden);
  } catch (err) {
    console.error('Fout bij ophalen eenheden:', err);
    res.status(500).json({ message: 'Fout bij ophalen eenheden' });
  }
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

app.post('/api/amber', authenticateApiKey, async (req, res) => {
  const { name, userId, location, description, timestamp } = req.body;
  if (!name || !userId || !location || !description || !timestamp) {
    return res.status(400).json({ error: "Ontbrekende velden" });
  }
  const alert = { name, userId, location, description, timestamp: req.userId };
  try {
    await db.collection('amberAlert').add(alert);
    res.status(201).json({ message: 'Amber Alert opgeslagen', alert });
  } catch (err) {
    console.error(' Fout bij opslaan Amber Alert', err);
    res.status(500).json({ message: 'Fout bij opslaan amber alert' });
  }
});

app.get('/api/amber', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('amberalert').where('userId', '==', req.userId).get();
    const alerts = snapshot.docs.map(doc => doc.data());
    res.json(alerts);
  } catch (err) {
    console.error(' Fout bij ophalen Amber alert', err);
    res.status(500).json({ meessage: 'Fout bij ophalen amber alerts' });
  }
});


// ✅ NL ALERT AANMAKEN
app.post('/api/nlalert', authenticateApiKey, async (req, res) => {
  const { title, message, location, timestamp } = req.body;
  if (!title || !message || !location || !timestamp) {
    return res.status(400).json({ error: 'Ontbrekende velden voor NLAlert' });
  }
  const alert = { title, message, location, timestamp, userId: req.userId };
  try {
    await db.collection('nlAlerts').add(alert);
    res.status(201).json({ message: 'NLAlert opgeslagen', alert });
  } catch (err) {
    console.error('❌ Fout bij opslaan NLAlert:', err);
    res.status(500).json({ message: 'Fout bij opslaan NLAlert' });
  }
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


// ✅ NL ALERTS OPHALEN
app.get('/api/nlalert', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('nlAlerts').where('userId', '==', req.userId).get();
    const alerts = snapshot.docs.map(doc => doc.data());
    res.json(alerts);
  } catch (err) {
    console.error('❌ Fout bij ophalen NLAlerts:', err);
    res.status(500).json({ message: 'Fout bij ophalen NLAlerts' });
  }
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
