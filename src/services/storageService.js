const supabase = require('../config/supabaseClient');

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'houseofurvaah-media';

const fs = require('fs');

/**
 * Get public URL for any media file stored in houseofurvaah-media bucket
 * @param {string} filePath e.g. "products/product-001/front.webp" or "Images/Brown02.png"
 */
exports.getPublicMediaUrl = (filePath) => {
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath;
    }
    let cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    if (cleanPath.startsWith('assets/')) {
        cleanPath = cleanPath.replace(/^assets\//, '');
    }

    if (supabase) {
        const { data } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(cleanPath);
        return data.publicUrl;
    }

    const supabaseUrl = process.env.SUPABASE_URL || 'https://fhbdceauisvlcpmuzpmf.supabase.co';
    return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${cleanPath}`;
};

exports.uploadImage = async (file, folder = 'brand') => {
    try {
        if (!file || !file.originalname) {
            throw new Error('Invalid file: missing originalname');
        }

        const cleanName = (file.originalname || 'media').replace(/[^a-zA-Z0-9.]/g, '_');
        // If it's a disk file (has path), use uploadFromFile
        if (file.path) {
            return await exports.uploadFromFile(file.path, `${folder}/${Date.now()}-${cleanName}`, file.mimetype);
        }

        return await exports.uploadBuffer(file.buffer, `${folder}/${Date.now()}-${cleanName}`, file.mimetype || 'image/jpeg');
    } catch (error) {
        throw error;
    }
};

exports.uploadFromFile = async (filePath, destinationPath, contentType) => {
    try {
        const fileBuffer = await fs.promises.readFile(filePath);
        return await exports.uploadBuffer(fileBuffer, destinationPath, contentType);
    } catch (error) {
        throw error;
    }
};

exports.uploadBuffer = async (buffer, filePath, contentType = 'application/pdf') => {
    try {
        const fileExt = filePath.split('.').pop()?.toLowerCase();
        let finalContentType = contentType;
        if (!finalContentType || finalContentType === 'application/octet-stream' || finalContentType === 'application/pdf') {
            if (fileExt === 'mp4' || fileExt === 'm4v') finalContentType = 'video/mp4';
            else if (fileExt === 'webm') finalContentType = 'video/webm';
            else if (fileExt === 'mov') finalContentType = 'video/quicktime';
            else if (fileExt === 'ogg') finalContentType = 'video/ogg';
            else if (fileExt === 'jpg' || fileExt === 'jpeg') finalContentType = 'image/jpeg';
            else if (fileExt === 'png') finalContentType = 'image/png';
            else if (fileExt === 'webp') finalContentType = 'image/webp';
        }
        const finalPath = filePath.includes('.') ? filePath : `${filePath}.${finalContentType.split('/')[1] || 'bin'}`;

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(finalPath, buffer, {
                contentType: finalContentType,
                upsert: true
            });

        if (error) {
            console.error("Supabase Storage Error Details:", {
                message: error.message,
                name: error.name,
                status: error.status,
                stack: error.stack
            });
            throw new Error(`Supabase Upload Error: ${error.message} (${error.status || 'No status'})`);
        }

        const { data: publicUrlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(finalPath);

        return publicUrlData.publicUrl;
    } catch (error) {
        throw error;
    }
};

exports.deleteImage = async (imageUrl) => {
    try {
        if (!imageUrl) return;

        // Extract path from URL
        // Example URL: https://xyz.supabase.co/storage/v1/object/public/houseofurvaah-media/brand/filename.jpg
        const path = imageUrl?.split(`${BUCKET_NAME}/`).pop();

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([path]);

        if (error) {
            throw new Error(`Supabase Delete Error: ${error.message}`);
        }

        return data;
    } catch (error) {
        throw error;
    }
};

exports.deleteFolder = async (folderPath) => {
    try {
        // List files in the folder first
        const { data: listData, error: listError } = await supabase.storage
            .from(BUCKET_NAME)
            .list(folderPath);

        if (listError) throw listError;

        if (listData && listData.length > 0) {
            const filesToRemove = listData.map(file => `${folderPath}/${file.name}`);
            const { error: removeError } = await supabase.storage
                .from(BUCKET_NAME)
                .remove(filesToRemove);

            if (removeError) throw removeError;
        }

        return true;
    } catch (error) {
        throw error;
    }
};

/**
 * One-time signed upload link so the browser can send a large file (product videos) straight to
 * storage. Serverless hosts cap API request bodies (~4.5 MB on Vercel), so videos cannot pass
 * through the API itself.
 */
exports.createSignedUpload = async (folder, originalName) => {
    const cleanName = String(originalName || 'media').replace(/[^a-zA-Z0-9.]/g, '_');
    const filePath = `${folder}/${Date.now()}-${cleanName}`;
    const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUploadUrl(filePath);
    if (error) throw error;
    return { path: data.path || filePath, token: data.token, signedUrl: data.signedUrl, bucket: BUCKET_NAME, publicUrl: exports.getPublicMediaUrl(filePath) };
};
