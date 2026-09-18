const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Urvaah Workspace/Urvaah-BA/.env' });

async function createCanonicalBucket() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const targetBucket = 'houseofurvaah-media';

  console.log(`Checking bucket '${targetBucket}'...`);
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  
  if (listErr) {
    console.error('❌ Failed to list buckets:', listErr.message);
    process.exit(1);
  }

  const exists = buckets.some(b => b.name === targetBucket);

  if (exists) {
    console.log(`✅ Bucket '${targetBucket}' already exists.`);
  } else {
    console.log(`Creating public bucket '${targetBucket}'...`);
    const { data, error } = await supabase.storage.createBucket(targetBucket, {
      public: true,
      allowedMimeTypes: null,
      fileSizeLimit: null
    });

    if (error) {
      console.error(`❌ Error creating bucket '${targetBucket}':`, error.message);
      process.exit(1);
    }
    console.log(`✅ Bucket '${targetBucket}' created successfully!`);
  }
}

createCanonicalBucket();
