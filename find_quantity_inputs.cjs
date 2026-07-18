const fs = require('fs');
const path = require('path');

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchDir(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.match(/name=\{?`?.*quantity.*?`?\}?/i)) {
                console.log(fullPath);
                // Print surrounding lines
                const lines = content.split('\n');
                lines.forEach((line, i) => {
                    if (line.match(/name=\{?`?.*quantity.*?`?\}?/i)) {
                        console.log(`  Line ${i+1}: ${line.trim()}`);
                        // Let's also look a few lines around for Input and className
                        for (let j = Math.max(0, i-2); j < Math.min(lines.length, i+6); j++) {
                             if (lines[j].includes('className') || lines[j].includes('<Input')) {
                                console.log(`    Ctx: ${lines[j].trim()}`);
                             }
                        }
                    }
                });
            }
        }
    }
}

searchDir('client/src/components');
searchDir('client/src/pages');
