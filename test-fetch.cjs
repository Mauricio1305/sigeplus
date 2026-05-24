const http = require('http');
const jwt = require('jsonwebtoken');

async function run() {
  const token = jwt.sign({ tenant_id: 1, id: 1, email: 'suport.mp@gmail.com', perfil: 'superadmin' }, 'saas-secret-key-123');
  console.log("Token:", token);

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard/top-products?year=2026&month=todos',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      console.log('BODY:', body.substring(0, 100));
    });
  });

  req.on('error', (e) => {
    console.error("REQ ERROR", e);
  });
  req.end();
}

run();
