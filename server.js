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
let eenheden = []; // <-- toegevoegd

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

// 🔊 API: Luchtalarm aansturen
app.post('/api/luchtalarm', async (req, res) => {
    const { actie } = req.body;

    if (!actie || !['start', 'stop', 'test'].includes(actie)) {
        return res.status(400).json({ message: 'Ongeldige actie voor luchtalarm' });
    }

    try {
        // Hier simuleer je het aanroepen van Roblox via een externe brug
        // Bijvoorbeeld via Open Cloud / webhook / externe queue
        console.log(`🚨 Luchtalarm trigger: ${actie}`);

        // TODO: Hier kun je Roblox triggeren via bijv. webhook of RoProxy
        // Voorbeeld (optioneel):
        // await fetch('https://roblox-webhook-url', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ action: actie })
        // });

        res.json({ message: `✅ Luchtalarm actie '${actie}' verstuurd` });
    } catch (error) {
        console.error('Fout bij luchtalarm:', error);
        res.status(500).json({ message: 'Serverfout bij luchtalarm' });
    }
});


// 🚀 Start de server
app.listen(PORT, () => {
    console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
