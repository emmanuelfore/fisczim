const fs = require('fs');
let code = fs.readFileSync('server/swagger.ts', 'utf8');

// Replace the path definitions
code = code.replace(/'\/api\/companies\/\{id\}\/zimra\//g, "'/api/zimra/");

// Remove the simple one-element parameter arrays for 'id'
code = code.replace(/parameters:\s*\[\{\s*in:\s*'path',\s*name:\s*'id',\s*required:\s*true,\s*schema:\s*\{\s*type:\s*'integer'\s*\}\s*\}\],?/g, '');

// For the multi-parameter arrays, remove the 'id' parameter object
code = code.replace(/\{\s*in:\s*'path',\s*name:\s*'id',\s*required:\s*true,\s*schema:\s*\{\s*type:\s*'integer'\s*\}\s*\},?/g, '');

// Sometimes after removing it, the array might have an empty slot or look like:
// parameters: [
//       
//     { in: 'path', name: 'invoiceNumber'... }
// ]
// which is valid Javascript/Typescript as long as there is no leading comma.

fs.writeFileSync('server/swagger.ts', code);
console.log("Swagger updated");
