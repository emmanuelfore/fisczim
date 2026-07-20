import xlsx from 'xlsx';

const workbook = xlsx.readFile('/home/emmanuel/Downloads/DEBTORS MANAGEMENT (1) (1).xlsx');
console.log('Sheets:', workbook.SheetNames);
for (const sheetName of workbook.SheetNames) {
    console.log('\n--- Sheet:', sheetName);
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet).slice(0, 5);
    console.log(JSON.stringify(data, null, 2));
}
