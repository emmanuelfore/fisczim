const fs = require('fs');
let code = fs.readFileSync('server/swagger.ts', 'utf8');

// Replace the path definitions
code = code.replace(/'\/api\/companies\/\{id\}\/zimra\//g, "'/api/zimra/");

// Remove the simple one-element parameter arrays for 'id'
code = code.replace(/parameters:\s*\[\{\s*in:\s*'path',\s*name:\s*'id',\s*required:\s*true,\s*schema:\s*\{\s*type:\s*'integer'\s*\}\s*\}\],?/g, '');

// For the multi-parameter arrays, remove the 'id' parameter object and its trailing/leading commas
code = code.replace(/\{\s*in:\s*'path',\s*name:\s*'id',\s*required:\s*true,\s*schema:\s*\{\s*type:\s*'integer'\s*\}\s*\},?/g, '');

fs.writeFileSync('server/swagger.ts', code);
console.log("Swagger updated");
