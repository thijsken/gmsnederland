const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Tijdelijke opslag voor meldingen
let meldingen = [];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Hiermee geef je je public map door

// Root endpoint voor de dashboardpagina
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Melding ontvangen via POST
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

// API: Alle meldingen ophalen via GET
app.get('/api/meldingen', (req, res) => {
    res.json(meldingen);
});

// Start de server
app.listen(PORT, () => {
    console.log(`🚀 Server draait op http://localhost:${PORT}`);
});
