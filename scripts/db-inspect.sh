#!/bin/bash
# Mostra il contenuto del Redis DB

# Usa la REDIS_URL dall'ambiente se presente, altrimenti il default del progetto.
REDIS_URL="${REDIS_URL:-redis://default:AsHNx9fs8kDhPI77UJpOEVB2OnLuvA6i@sugar-songs-popcorn-72314.db.redis.io:10731}"

node -e "
const { createClient } = require('redis');
const client = createClient({ url: '$REDIS_URL' });
client.connect().then(async () => {
  const keys = await client.keys('*');
  console.log('Chiavi totali:', keys.length);
  if (!keys.length) { console.log('(DB vuoto)'); await client.quit(); return; }
  for (const k of keys) {
    const val = await client.get(k);
    try {
      const obj = JSON.parse(val);
      const config = typeof obj.config === 'string' ? JSON.parse(obj.config) : obj.config;
      console.log('\n--- ' + k);
      console.log('  name:      ' + (config?.global?.name || '(senza nome)'));
      console.log('  status:    ' + obj.status);
      console.log('  updatedAt: ' + obj.updatedAt);
      console.log('  id:        ' + obj.id);
    } catch {
      console.log(k + ' ->', val);
    }
  }
  await client.quit();
}).catch(e => { console.error('Connessione fallita:', e.message); process.exit(1); });
"
