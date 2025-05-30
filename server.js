const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Firebase Initialisatie
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

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
