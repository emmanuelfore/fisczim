const fs = require('fs');

let diff = fs.readFileSync('routes_diff.patch', 'utf8');
let lines = diff.split('\n');

let routesCode = fs.readFileSync('server/routes.ts', 'utf8');
let routesLines = routesCode.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('-  app.') && lines[i+1] && lines[i+1].startsWith('+  app.xyz(')) {
        let originalLine = lines[i].substring(1); // remove '-'
        let badLine = lines[i+1].substring(1); // remove '+'
        
        // Find badLine in routesLines and replace
        let idx = routesLines.findIndex(l => l === badLine);
        if (idx !== -1) {
            routesLines[idx] = originalLine;
        }
    }
}

fs.writeFileSync('server/routes.ts', routesLines.join('\n'));
console.log('Restored bad routes');
