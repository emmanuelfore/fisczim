import fs from 'fs';

const filePath = 'shared/schema.ts';
const content = fs.readFileSync(filePath, 'utf8');

const targetContent = `  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("products_company_id_idx").on(table.companyId),
  };
});`;

const replacementContent = `  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    companyIdIdx: index("products_company_id_idx").on(table.companyId),
    companySkuUnique: unique("products_company_sku_idx").on(table.companyId, table.sku),
  };
});`;

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = targetContent.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTarget)) {
    const updatedContent = normalizedContent.replace(normalizedTarget, replacementContent);
    fs.writeFileSync(filePath, updatedContent);
    console.log('Successfully updated shared/schema.ts');
} else {
    console.error('Target content not found in shared/schema.ts');
    // Debug
    const startSnippet = 'companyIdIdx: index("products_company_id_idx").on(table.companyId),';
    if (normalizedContent.includes(startSnippet)) {
        console.log('Found partial match, checking surroundings...');
        const idx = normalizedContent.indexOf(startSnippet);
        console.log('Snippet:', JSON.stringify(normalizedContent.substring(idx - 100, idx + 200)));
    }
}
