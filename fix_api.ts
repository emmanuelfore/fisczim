import fs from 'fs';
const file = './mobile/src/lib/api.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace the fallback to session: null
const oldSessionRace = `        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 10000)
          )
        ]);
        session = sessionResult?.data?.session ?? null;`;

const newSessionRace = `        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: any } }>((_, reject) =>
            setTimeout(() => reject(new Error("Network delay: Unable to verify session in time. Please check your connection.")), 8000)
          )
        ]);
        session = sessionResult?.data?.session ?? null;`;

content = content.replace(oldSessionRace, newSessionRace);

// Replace the apiJson error handling to give a better message for 401
const oldError = `    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(\`[API] Request to \${path} failed with \${res.status}:\`, text);
      throw new Error(text || \`Request failed (\${res.status})\`);
    }`;

const newError = `    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(\`[API] Request to \${path} failed with \${res.status}:\`, text);
      
      let errorMsg = text || \`Request failed (\${res.status})\`;
      try {
        const json = JSON.parse(text);
        if (json.message) errorMsg = json.message;
        else if (json.error) errorMsg = typeof json.error === 'string' ? json.error : errorMsg;
      } catch(e) {}
      
      if (res.status === 401) {
        throw new Error("Authentication failed or session temporarily unreachable due to network. If this persists, try restarting the app.");
      }
      throw new Error(errorMsg);
    }`;

content = content.replace(oldError, newError);

fs.writeFileSync(file, content);
