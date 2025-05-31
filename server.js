// 🔧 Express + Firestore + Stripe setup
const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');
const Stripe = require('stripe');

const app = express();
const stripe = Stripe('sk_test_51RUYjVPLQUgW1JNriYW9FWG6YI33hjKKK0OvILsNUhM83uevbUcsqTZnIv96p47L1gNAwwHMtZg8Y1sh3xstSKES00jfzPMuZk');

const corsOptions = {
  origin: 'https://gmsnederland-3029e.web.app',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
});
const db = admin.firestore();

// In-memory per server
const serverState = {
  meldingen: {},
  eenheden: {},
  luchtalarmPalen: {},
  posten: {},
  lastLuchtalarmActie: {},
  lastPostAlarm: {}
};

function getForServer(state, serverId) {
  if (!state[serverId]) state[serverId] = [];
  return state[serverId];
}

// ✅ Middleware API-key authenticatie
async function authenticateApiKey(req, res, next) {
  const apiKey = req.header('x-api-key');
  if (!apiKey) return res.status(401).json({ message: 'API key ontbreekt' });

  const snapshot = await db.collection('apiKeys').where('apiKey', '==', apiKey).get();
  if (snapshot.empty) return res.status(403).json({ message: 'Ongeldige API key' });

  const doc = snapshot.docs[0];
  const data = doc.data();

  req.userId = doc.id;
  req.serverId = data.serverId;
  next();
}

// 🔑 Genereer API key met serverId
app.post('/api/apikey/generate', async (req, res) => {
  const { userId, serverId } = req.body;
  if (!userId || !serverId) return res.status(400).json({ message: 'userId en serverId verplicht' });

  try {
    const apiKey = crypto.randomUUID();
    await db.collection('apiKeys').doc(userId).set({ apiKey, serverId });
    res.status(201).json({ apiKey });
  } catch (err) {
    res.status(500).json({ message: 'Fout bij opslaan API key' });
  }
});

// ✅ Stripe betaling
app.post('/create-payment-intent', async (req, res) => {
  const { amount, packageName } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
      payment_method_types: ['ideal'],
      description: `Betaling voor ${packageName}`
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// ✅ Melding aanmaken / ophalen
app.post('/api/meldingen', authenticateApiKey, async (req, res) => {
  const melding = { ...req.body, timestamp: Date.now(), status: 'new', userId: req.userId, serverId: req.serverId };
  try {
    await db.collection('meldingen').add(melding);
    getForServer(serverState.meldingen, req.serverId).push(melding);
    res.status(201).json({ message: '✅ Melding ontvangen', data: melding });
  } catch {
    res.status(500).json({ message: 'Fout bij opslaan melding' });
  }
});

app.get('/api/meldingen', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('meldingen').where('serverId', '==', req.serverId).get();
    res.json(snapshot.docs.map(doc => doc.data()));
  } catch {
    res.status(500).json({ message: 'Fout bij ophalen meldingen' });
  }
});

// ✅ Eenheden
app.post('/api/units', authenticateApiKey, async (req, res) => {
  const unit = { ...req.body, userId: req.userId, serverId: req.serverId };
  try {
    await db.collection('units').add(unit);
    res.status(200).json({ message: 'Eenheid opgeslagen', data: unit });
  } catch {
    res.status(500).json({ message: 'Fout bij opslaan eenheid' });
  }
});

app.get('/api/units', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('units').where('serverId', '==', req.serverId).get();
    res.json(snapshot.docs.map(doc => doc.data()));
  } catch {
    res.status(500).json({ message: 'Fout bij ophalen eenheden' });
  }
});

// ✅ Alerts (Amber + NLAlert)
app.post('/api/amber', authenticateApiKey, async (req, res) => {
  const alert = { ...req.body, serverId: req.serverId };
  try {
    await db.collection('amberAlert').add(alert);
    res.status(201).json({ message: 'Amber Alert opgeslagen', alert });
  } catch {
    res.status(500).json({ message: 'Fout bij opslaan amber alert' });
  }
});

app.get('/api/amber', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('amberAlert').where('serverId', '==', req.serverId).get();
    res.json(snapshot.docs.map(doc => doc.data()));
  } catch {
    res.status(500).json({ message: 'Fout bij ophalen amber alerts' });
  }
});

app.post('/api/nlalert', authenticateApiKey, async (req, res) => {
  const alert = { ...req.body, userId: req.userId, serverId: req.serverId };
  try {
    await db.collection('nlAlerts').add(alert);
    res.status(201).json({ message: 'NLAlert opgeslagen', alert });
  } catch {
    res.status(500).json({ message: 'Fout bij opslaan NLAlert' });
  }
});

app.get('/api/nlalert', authenticateApiKey, async (req, res) => {
  try {
    const snapshot = await db.collection('nlAlerts').where('serverId', '==', req.serverId).get();
    res.json(snapshot.docs.map(doc => doc.data()));
  } catch {
    res.status(500).json({ message: 'Fout bij ophalen NLAlerts' });
  }
});

// ✅ Start server
app.listen(4242, () => console.log('Server draait op http://localhost:4242'));
