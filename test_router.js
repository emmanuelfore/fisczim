const express = require('express');
const app = express();

app.use((req, res, next) => {
    if (req.url.startsWith('/api/zimra')) {
        req.url = req.url.replace('/api/zimra', '/api/companies/86/zimra');
    }
    next();
});

app.get('/api/companies/:id/zimra/ping', (req, res) => {
    res.send(`pong from company ${req.params.id}`);
});

app.listen(5002, () => console.log('started'));
