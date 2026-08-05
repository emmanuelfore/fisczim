const express = require('express');
const app = express();

app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    console.log("Middleware req.params:", req.params);
    originalSend.call(this, body);
  };
  next();
});

app.get('/api/test/:companyId', (req, res) => {
  console.log("Handler req.params:", req.params);
  res.json({ success: true });
});

const server = app.listen(0, () => {
  require('http').get(`http://localhost:${server.address().port}/api/test/123`, (res) => {
    res.on('data', () => {});
    res.on('end', () => {
      server.close();
    });
  });
});
