const fs = require('fs');

let diff = fs.readFileSync('routes_diff.patch', 'utf8');
let lines = diff.split('\n');

let routesCode = fs.readFileSync('server/routes.ts', 'utf8');
let routesLines = routesCode.split('\n');

let searchIdx = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('-  app.') && lines[i+1] && lines[i+1].startsWith('+  app.xyz(')) {
        let originalLine = lines[i].substring(1); 
        let badLine = lines[i+1].substring(1); 
        
        // Find badLine in routesLines starting from searchIdx
        let idx = -1;
        for (let j = searchIdx; j < routesLines.length; j++) {
            if (routesLines[j] === badLine) {
                idx = j;
                break;
            }
        }
        if (idx !== -1) {
            routesLines[idx] = originalLine;
            searchIdx = idx + 1;
        }
    }
}

fs.writeFileSync('server/routes.ts', routesLines.join('\n'));
console.log('Restored remaining bad routes');
