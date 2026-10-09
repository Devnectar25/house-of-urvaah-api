const https = require('https');
const SUPABASE_CDN = 'https://fhbdceauisvlcpmuzpmf.supabase.co/storage/v1/object/public/houseofurvaah-media';

const filesToCheck = [
  'Images/Blue_Halter.jpg',
  'Images/Blue01.png',
  'Images/Blue02.png',
  'Images/Blue03.png',
  'Images/Peach01.png',
  'Images/Peach02.png',
  'Images/Peach03.png',
  'Images/Peach04.png',
  'Images/Brown_Floral.jpg',
  'Images/Brown01.png',
  'Images/Brown02.png',
  'Images/Brown03.png',
  'Images/Corset01.png',
  'Images/Corset02.png',
  'Images/Corset03.png',
  'Images/Corset04.png'
];

async function check() {
  console.log('Checking Supabase Storage media:');
  for (const f of filesToCheck) {
    const url = `${SUPABASE_CDN}/${f}`;
    await new Promise((res) => {
      https.get(url, (r) => {
        console.log(`${f} -> HTTP ${r.statusCode}`);
        res();
      }).on('error', (e) => {
        console.log(`${f} -> ERROR ${e.message}`);
        res();
      });
    });
  }
  process.exit(0);
}

check();
