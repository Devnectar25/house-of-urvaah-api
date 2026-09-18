const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
require('dotenv').config({ path: 'c:/Urvaah Workspace/Urvaah-BA/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const TARGET_BUCKET = 'houseofurvaah-media';
const LEGACY_BUCKET = 'house-ofvaah';
const FRONTEND_PUBLIC_DIR = 'c:/Urvaah Workspace/House-Of-Urvaah/public/assets';

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.gif': return 'image/gif';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}

async function verifyHttpUrl(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function migrateMedia() {
  console.log('=== STARTING MEDIA MIGRATION TO houseofurvaah-media ===');

  let uploadedCount = 0;
  let verifiedCount = 0;

  // 1. Upload Product Images from public/assets/Images
  const imagesDir = path.join(FRONTEND_PUBLIC_DIR, 'Images');
  if (fs.existsSync(imagesDir)) {
    const imageFiles = fs.readdirSync(imagesDir);
    console.log(`\nFound ${imageFiles.length} images in ${imagesDir}`);

    for (const file of imageFiles) {
      const filePath = path.join(imagesDir, file);
      const buffer = fs.readFileSync(filePath);
      const mime = getMimeType(file);

      // Upload to products/ structure and Images/ structure for full compatibility
      const targetPaths = [`products/${file}`, `Images/${file}`];

      for (const destPath of targetPaths) {
        const { error } = await supabase.storage
          .from(TARGET_BUCKET)
          .upload(destPath, buffer, { contentType: mime, upsert: true });

        if (error) {
          console.error(`❌ Failed to upload ${destPath}:`, error.message);
        } else {
          uploadedCount++;
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/${TARGET_BUCKET}/${destPath}`;
          const ok = await verifyHttpUrl(publicUrl);
          if (ok) verifiedCount++;
          console.log(`✅ Uploaded & Verified: ${destPath} -> HTTP 200`);
        }
      }
    }
  }

  // 2. Upload Video Files from public/assets/video
  const videoDir = path.join(FRONTEND_PUBLIC_DIR, 'video');
  if (fs.existsSync(videoDir)) {
    const videoFiles = fs.readdirSync(videoDir);
    console.log(`\nFound ${videoFiles.length} videos in ${videoDir}`);

    for (const file of videoFiles) {
      const filePath = path.join(videoDir, file);
      const buffer = fs.readFileSync(filePath);
      const mime = getMimeType(file);

      const targetPaths = [`videos/${file}`, `Videos/${file}`];

      for (const destPath of targetPaths) {
        const { error } = await supabase.storage
          .from(TARGET_BUCKET)
          .upload(destPath, buffer, { contentType: mime, upsert: true });

        if (error) {
          console.error(`❌ Failed to upload ${destPath}:`, error.message);
        } else {
          uploadedCount++;
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/${TARGET_BUCKET}/${destPath}`;
          const ok = await verifyHttpUrl(publicUrl);
          if (ok) verifiedCount++;
          console.log(`✅ Uploaded & Verified: ${destPath} -> HTTP 200`);
        }
      }
    }
  }

  // 3. Upload Brand Logos from public/assets
  const brandFiles = ['brand-logo.jpg', 'brand-logo.png', 'logo.png'];
  for (const file of brandFiles) {
    const filePath = path.join(FRONTEND_PUBLIC_DIR, file);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const mime = getMimeType(file);
      const destPath = `brand/${file}`;

      const { error } = await supabase.storage
        .from(TARGET_BUCKET)
        .upload(destPath, buffer, { contentType: mime, upsert: true });

      if (error) {
        console.error(`❌ Failed to upload ${destPath}:`, error.message);
      } else {
        uploadedCount++;
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${TARGET_BUCKET}/${destPath}`;
        const ok = await verifyHttpUrl(publicUrl);
        if (ok) verifiedCount++;
        console.log(`✅ Uploaded & Verified: ${destPath} -> HTTP 200`);
      }
    }
  }

  console.log(`\n🎉 MIGRATION COMPLETE! Total Files Uploaded: ${uploadedCount}, HTTP 200 Verified: ${verifiedCount}`);
}

migrateMedia();
