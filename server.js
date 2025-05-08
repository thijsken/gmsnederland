const express = require('express');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ Endpoint om een melding te ontvangen via POST
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

// ✅ Endpoint om alle meldingen op te vragen
app.get('/api/meldingen', (req, res) => {
    res.json(meldingen);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server gestart op http://localhost:${PORT}`);
});
