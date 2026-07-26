const https = require('https');
const FB = 'https://pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app';

function get(path) { return new Promise((resolve, reject) => { https.get(FB + path + '.json', res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } }); }).on('error', reject); }); }

const COLLECTIONS = ['products','categories','blogPosts','banners','videos','orders','customers','cms','aiJobs','aiDrafts'];

async function main() {
  const dryRun = !process.argv.includes('--execute');
  console.log('=== PSH Migration Preparation Tool ===');
  console.log('Mode: ' + (dryRun ? 'DRY RUN' : 'EXECUTE') + ' (default: dry-run)');
  console.log('');

  const root = await get('/');
  const existingKeys = root ? Object.keys(root).filter(k => !k.startsWith('_') && !k.includes('error') && !['businesses','businessMembers','roles','.settings'].includes(k)) : [];

  console.log('Root nodes for migration: ' + existingKeys.join(', '));
  console.log('');
  console.log('--- Data size estimate ---');
  let total = 0;
  let results = {};
  for (const key of COLLECTIONS) {
    const data = await get('/' + key);
    const count = data ? Object.keys(data).length : 0;
    if (count > 0) {
      results[key] = count;
      total += count;
      console.log(key + ': ' + count + ' records → businesses/pshop-music/' + key);
    }
  }
  console.log('Total records to migrate: ' + total);
  console.log('');
  console.log('--- Rollback plan ---');
  console.log('1. Backup each collection before migration: GET /{collection}.json');
  console.log('2. Migrate: for each record, write to businesses/pshop-music/{collection}/{id}');
  console.log('3. Verify: count records in businesses/pshop-music/{collection} matches source');
  console.log('4. Rollback: if failed, copy backup back to original node');
  console.log('');
  if (dryRun) {
    console.log('DRY RUN completed. NO data was changed.');
    console.log('Run with --execute to perform actual migration.');
    console.log('Backup recommended before execute: node prepare-migration.js --backup');
  }
}
main().catch(e => console.error('Error:', e.message));
