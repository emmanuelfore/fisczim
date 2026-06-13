with open('server/lib/inventory.ts', 'r') as f:
    content = f.read()

content = content.replace('storage.getSystemAccountCodePublic(', 'storage.getSystemAccountCode(')

with open('server/lib/inventory.ts', 'w') as f:
    f.write(content)

with open('server/storage.ts', 'r') as f:
    s_content = f.read()

target_interface = """  // System Accounts
  getAccountsBySubclass(companyId: number, subclass: string): Promise<Account[]>;
  getAccountByCode(companyId: number, code: string): Promise<Account | undefined>;"""

replacement_interface = """  // System Accounts
  getAccountsBySubclass(companyId: number, subclass: string): Promise<Account[]>;
  getAccountByCode(companyId: number, code: string): Promise<Account | undefined>;
  getSystemAccountCode(companyId: number, key: any, tx?: any): Promise<string>;"""

if target_interface in s_content:
    s_content = s_content.replace(target_interface, replacement_interface)
else:
    # try another spot
    target_interface2 = """  // General Settings
  getAccountingSettings(companyId: number): Promise<any>;"""
    replacement_interface2 = """  // General Settings
  getAccountingSettings(companyId: number): Promise<any>;
  getSystemAccountCode(companyId: number, key: any, tx?: any): Promise<string>;"""
    s_content = s_content.replace(target_interface2, replacement_interface2)

with open('server/storage.ts', 'w') as f:
    f.write(s_content)

