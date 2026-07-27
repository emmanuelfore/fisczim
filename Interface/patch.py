import re

with open('Form1.cs', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix elvis operators
text = text.replace("res.receiptNumber?.ToString()", "((res.receiptNumber != null) ? res.receiptNumber.ToString() : null)")
text = text.replace("res.receipt?.fiscalDayNo?.ToString()", "((res.receipt != null && res.receipt.fiscalDayNo != null) ? res.receipt.fiscalDayNo.ToString() : null)")
text = text.replace("res.receipt?.invoiceNo", "((res.receipt != null) ? res.receipt.invoiceNo : null)")
text = text.replace("res.receipt?.receiptTotal", "((res.receipt != null) ? res.receipt.receiptTotal : null)")
text = text.replace("res.receipt?.receiptDate", "((res.receipt != null) ? res.receipt.receiptDate : null)")
text = text.replace("res.receipt?.receiptGlobalNo", "((res.receipt != null) ? res.receipt.receiptGlobalNo : null)")
text = text.replace("res.receipt?.receiptCounter", "((res.receipt != null) ? res.receipt.receiptCounter : null)")
text = text.replace("res.receipt?.receiptTaxes", "((res.receipt != null) ? res.receipt.receiptTaxes : null)")
text = text.replace("Data = new RevResponse", "Data = new Data")

# Remove SetLicense
text = text.replace("SetLicense setLicense = new SetLicense();", "")
text = text.replace("if (setLicense.ShowDialog(this) == DialogResult.OK)", "")
text = text.replace("addToConfig(\"ApiKey\", setLicense.txtLicense.Text);", "")
text = text.replace("MessageBox.Show(\"API Key configured. Please restart application.\");", "MessageBox.Show(\"License checking is handled through the Wizard. Run Setup to change API Key.\");")
text = text.replace("setLicense.Dispose();", "")

# Append missing methods
missing = \"\"\"
        private void dashboardToolStripMenuItem_Click(object sender, EventArgs e)
        {
            new DashboardForm().Show();
        }

        private void openTestToolToolStripMenuItem_Click(object sender, EventArgs e)
        {
            new Wizard().Show();
        }

        private async void getDeviceDetailsToolStripMenuItem_Click(object sender, EventArgs e)
        {
            try
            {
                var jar = await client.GetDeviceAsync();
                MessageBox.Show(jar, \"Device Details\", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(\"Failed to fetch device details: \" + ex.Message, \"Error\", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void viewLastReceiptToolStripMenuItem_Click(object sender, EventArgs e)
        {
            MessageBox.Show(\"Last receipt preview requires recent transaction.\", \"FiscalStack\", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
\"\"\"

# Insert before the last two braces
text = re.sub(r'\}\s*\}\s*$', missing + '\n    }\n}', text)

# SetVisibleCore
text = text.replace("private void EnsureDirectorySetting", "protected override void SetVisibleCore(bool value)\n        {\n            base.SetVisibleCore(false);\n        }\n\n        private void EnsureDirectorySetting")

with open('Form1.cs', 'w', encoding='utf-8') as f:
    f.write(text)

print("Patched Form1.cs")
