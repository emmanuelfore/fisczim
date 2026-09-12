const fs = require('fs');
let code = fs.readFileSync('server/jobs.ts', 'utf8');
const target = `                    // 3. Format Date for ZIMRA (ISO local, but just YYYY-MM-DD for closeDay usually? 
                    // Actually spec says fiscalDayDate is YYYY-MM-DDTHH:mm:ss in signature base, but let's check ZimraDevice.closeDay)
                    // ZimraDevice.closeDay uses fiscalDayDate as a string.
                    const harareMsOffset = 2 * 60 * 60 * 1000;
                    const nowAtHarare = new Date(Date.now() + harareMsOffset);
                    const fiscalDayDate = nowAtHarare.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss

                    console.log(\`[Job] Closing Fiscal Day \${fiscalDayNo} for \${company.name} at \${fiscalDayDate}\`);
                    
                    const result = await device.closeDay(
                        fiscalDayNo,
                        fiscalDayDate,
                        company.dailyReceiptCount || status.lastReceiptCounter || 0,
                        counters
                    ) as any;

                    const resultStatus = (result.fiscalDayStatus || "").toLowerCase();

                    // 4. Update local state only after confirmed closure.
                    if (resultStatus === 'fiscaldayclosed') {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: false,
                            lastFiscalDayStatus: 'FiscalDayClosed'
                        });

                        console.log(\`[Job] Successfully closed day for \${company.name}\`);
                    } else {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: true,
                            lastFiscalDayStatus: result.fiscalDayStatus || 'FiscalDayCloseFailed'
                        });

                        console.warn(\`[Job] Close day failed for \${company.name}; daily receipt counters preserved.\`);
                    }`;

const replacement = `                    // 3. Format Date for ZIMRA
                    const formatHarareDateOnly = (date) => {
                        const parts = new Intl.DateTimeFormat('en-GB', {
                            timeZone: 'Africa/Harare',
                            year: 'numeric', month: '2-digit', day: '2-digit'
                        }).formatToParts(date);
                        const p = (t) => parts.find(x => x.type === t)?.value;
                        return \`\${p('year')}-\${p('month')}-\${p('day')}\`;
                    };
                    let fiscalDayDate = formatHarareDateOnly(new Date());
                    if (company.fiscalDayOpenedAt) {
                        fiscalDayDate = formatHarareDateOnly(new Date(company.fiscalDayOpenedAt));
                    }

                    console.log(\`[Job] Closing Fiscal Day \${fiscalDayNo} for \${company.name} at \${fiscalDayDate}\`);
                    
                    let lastError = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            await device.closeDay(
                                fiscalDayNo,
                                fiscalDayDate,
                                company.dailyReceiptCount || status.lastReceiptCounter || 0,
                                counters
                            );
                            lastError = null;
                            break;
                        } catch (err) {
                            lastError = err;
                            if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
                        }
                    }

                    if (lastError) {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: true,
                            lastFiscalDayStatus: 'FiscalDayCloseFailed'
                        });
                        console.warn(\`[Job] Close day attempts failed for \${company.name}; daily receipt counters preserved.\`);
                        continue;
                    }

                    // 4. Verify closure asynchronously
                    console.log(\`[Job] Verifying closure status for \${company.name}...\`);
                    await new Promise(r => setTimeout(r, 4000));
                    const verifyStatus = await device.getStatus();

                    if (verifyStatus.fiscalDayStatus === 'FiscalDayCloseFailed') {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: true,
                            lastFiscalDayStatus: 'FiscalDayCloseFailed'
                        });
                        console.warn(\`[Job] Close day failed verification for \${company.name}; daily receipt counters preserved.\`);
                    } else {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: false,
                            lastFiscalDayStatus: 'FiscalDayClosed',
                            dailyReceiptCount: 0 // Explicitly reset on success
                        });
                        console.log(\`[Job] Successfully closed day for \${company.name}\`);
                    }`;

if (code.includes(target)) {
    fs.writeFileSync('server/jobs.ts', code.replace(target, replacement));
    console.log("Replaced successfully");
} else {
    console.log("Target not found");
}
