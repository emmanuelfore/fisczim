import pexpect
import sys

def deploy():
    # SSH command
    child = pexpect.spawn('ssh -o StrictHostKeyChecking=no root@161.97.115.59', encoding='utf-8')
    child.logfile = sys.stdout

    try:
        # Expect the password prompt
        child.expect(['password:', 'Password:'], timeout=10)
        
        # Send the password
        child.sendline('2512')
        
        # Wait for the prompt (root terminal usually ends with #)
        child.expect(['# ', pexpect.EOF, pexpect.TIMEOUT], timeout=10)
        
        print("\n\n--- LOGIN SUCCESSFUL ---")
        
        # Now run deployment commands for lekaku
        print("Running deploy scripts...")
        child.sendline('ls -la /var/www')
        child.expect('# ', timeout=5)
        
        child.sendline('cd /var/www/fiscalstack_lesotho && git fetch origin && git checkout lekaku && git pull origin lekaku && npm install && npm run build && pm2 reload ecosystem.config.cjs')
        
        # Wait up to 5 minutes for build and reload
        child.expect('# ', timeout=300)
        
        child.sendline('exit')
        child.expect(pexpect.EOF)
        print("\n\n--- DEPLOYMENT COMPLETE ---")
    except Exception as e:
        print("\n\n--- ERROR ---")
        print(str(e))

if __name__ == '__main__':
    deploy()
