const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Tijdelijke opslag
let meldingen = [];
let eenheden = [];
let luchtalarmPalen = []; // tijdelijke opslag

// 🌍 Root endpoint voor dashboard
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
        eenheden[index] = unit; // bijwerken
    } else {
        eenheden.push(unit); // nieuw
    }

    res.status(200).json({ message: 'Eenheid bijgewerkt', data: unit });
});

// ✅ GET: Eenheden ophalen
app.get('/api/units', (req, res) => {
    res.json(eenheden);
});

// ✅ POST: Paaldata ontvangen vanuit Roblox
app.post('/api/luchtalarm/palen', (req, res) => {
    const data = req.body;
    console.log("📥 POST ontvangen van Roblox:", data);
    console.log("✅ Type:", typeof data, "| Array?", Array.isArray(data));

    if (!Array.isArray(data)) {
        return res.status(400).json({ message: 'Ongeldige paaldata' });
    }

    luchtalarmPalen = data;
    console.log("✅ Paaldata opgeslagen:", luchtalarmPalen);
    res.json({ message: 'Paaldata opgeslagen' });
});

// ✅ GET: Paaldata opvragen door dashboard
app.get('/api/luchtalarm/palen', (req, res) => {
    console.log('📡 Dashboard vraagt paaldata:', luchtalarmPalen);
    res.json(luchtalarmPalen);
});

// Voeg deze eronder toe:
app.post('/api/luchtalarm/actie', (req, res) => {
  const { actie, id } = req.body;
  if (!actie || !id) {
    return res.status(400).json({ message: 'Fout: actie of id ontbreekt' });
  }
  console.log(`🚨 Actie '${actie}' ontvangen voor paal '${id}'`);
  res.status(200).json({ message: `Actie '${actie}' uitgevoerd op paal '${id}'` });
});

// 🚀 Start de server
app.listen(PORT, () => {
    console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
