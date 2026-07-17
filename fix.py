import re

with open('server/jobs.ts', 'r') as f:
    content = f.read()

pattern = r'(// 3\. Format Date for ZIMRA.*?console\.warn\(`\[Job\] Close day failed for \$\{company\.name\}; daily receipt counters preserved\.`\);\n\s+\})'

replacement = """// 3. Format Date for ZIMRA
                    const formatHarareDateOnly = (date: Date) => {
                        const parts = new Intl.DateTimeFormat('en-GB', {
                            timeZone: 'Africa/Harare',
                            year: 'numeric', month: '2-digit', day: '2-digit'
                        }).formatToParts(date);
                        const p = (t: string) => parts.find(x => x.type === t)?.value;
                        return `${p('year')}-${p('month')}-${p('day')}`;
                    };
                    let fiscalDayDate = formatHarareDateOnly(new Date());
                    if (company.fiscalDayOpenedAt) {
                        fiscalDayDate = formatHarareDateOnly(new Date(company.fiscalDayOpenedAt));
                    }

                    console.log(`[Job] Closing Fiscal Day ${fiscalDayNo} for ${company.name} at ${fiscalDayDate}`);
                    
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
                        console.warn(`[Job] Close day attempts failed for ${company.name}; daily receipt counters preserved.`);
                        continue;
                    }

                    // 4. Verify closure asynchronously
                    console.log(`[Job] Verifying closure status for ${company.name}...`);
                    await new Promise(r => setTimeout(r, 4000));
                    const verifyStatus = await device.getStatus() as any;

                    if (verifyStatus.fiscalDayStatus === 'FiscalDayCloseFailed') {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: true,
                            lastFiscalDayStatus: 'FiscalDayCloseFailed'
                        });
                        console.warn(`[Job] Close day failed verification for ${company.name}; daily receipt counters preserved.`);
                    } else {
                        await storage.updateCompany(company.id, {
                            fiscalDayOpen: false,
                            lastFiscalDayStatus: 'FiscalDayClosed',
                            dailyReceiptCount: 0 // Explicitly reset on success
                        });
                        console.log(`[Job] Successfully closed day for ${company.name}`);
                    }"""

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('server/jobs.ts', 'w') as f:
    f.write(new_content)
