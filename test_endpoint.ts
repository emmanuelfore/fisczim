import http from 'http';
const req = http.get('http://localhost:5000/api/companies/105/api-logs?limit=5', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("Status:", res.statusCode);
    console.log("Body:", data);
  });
});
req.on('error', console.error);
