const storageService = require('../services/storageService');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configure Multer for memory storage (for smaller files like images)
const memoryStorage = multer.memoryStorage();

// Configure Multer for disk storage (for larger files like videos)
const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(os.tmpdir(), 'house-of-urvaah-uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Clean filename to avoid issues with special characters
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, `${Date.now()}-${cleanName}`);
    }
});

exports.uploadMiddleware = multer({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for images
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, WebP, SVG, and PDF are allowed.'));
        }
    }
}).any();

// Video upload middleware using disk storage for large files
exports.uploadVideoMiddleware = multer({
    storage: diskStorage,
    limits: { fileSize: 250 * 1024 * 1024 }, // Increased to 250MB to be safe
    fileFilter: (req, file, cb) => {
        const isVideoMime = file.mimetype && (
            file.mimetype.startsWith('video/') || 
            ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'application/octet-stream'].includes(file.mimetype)
        );
        const isVideoExt = file.originalname && Boolean(file.originalname.match(/\.(mp4|webm|mov|m4v|ogg|mkv|avi)$/i));
        if (isVideoMime || isVideoExt) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload a supported video format (MP4, WebM, QuickTime, MOV, M4V).'));
        }
    }
}).single('video');

exports.uploadImage = async (req, res) => {
    try {
        const file = req.file || (req.files && req.files[0]);
        console.log(`[UPLOAD] Image request received: ${file?.originalname}, size: ${file?.size} bytes`);
        if (!file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const folderName = req.body?.folderName || req.body?.folder || 'products'; 
        const publicUrl = await storageService.uploadImage(file, folderName);

        console.log(`[UPLOAD] Image successful: ${publicUrl}`);
        res.json({
            success: true,
            url: publicUrl,
            message: "Image uploaded successfully"
        });
    } catch (error) {
        console.error("Error in uploadImage:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.uploadVideo = async (req, res) => {
    let tempFilePath = null;
    try {
        console.log(`[UPLOAD] Video headers received:`, {
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length']
        });
        
        if (!req.file) {
            console.error("[UPLOAD] No file in request. Check field name (should be 'video')");
            console.log("[UPLOAD] Body received:", req.body);
            return res.status(400).json({ success: false, message: "No video file uploaded" });
        }

        tempFilePath = req.file.path;
        console.log(`[UPLOAD] Video request received: ${req.file.originalname}, size: ${req.file.size} bytes`);
        
        const folderName = req.body.folderName || 'videos';
        console.log(`[UPLOAD] Starting storage upload from disk: ${tempFilePath} to folder: ${folderName}`);
        
        const publicUrl = await storageService.uploadImage(req.file, folderName);

        console.log(`[UPLOAD] Video successful: ${publicUrl}`);
        
        // Clean up temp file
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) { console.error("Cleanup error:", e); }
        }

        res.json({
            success: true,
            url: publicUrl,
            message: "Video uploaded successfully"
        });
    } catch (error) {
        console.error("Error in uploadVideo:", error);
        
        // Clean up temp file on error
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) { console.error("Cleanup error on failure:", e); }
        }

        res.status(500).json({ 
            success: false, 
            message: "Internal Server Error during video upload",
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

exports.deleteImage = async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ success: false, message: "Image URL is required" });
        }

        await storageService.deleteImage(imageUrl);
        res.json({ success: true, message: "Image deleted successfully" });
    } catch (error) {
        console.error("Error in deleteImage:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.deleteFolder = async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) {
            return res.status(400).json({ success: false, message: "Folder path is required" });
        }

        await storageService.deleteFolder(folderPath);
        res.json({ success: true, message: "Folder deleted successfully" });
    } catch (error) {
        console.error("Error in deleteFolder:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Admin: signed link for a direct browser-to-storage video upload (bypasses the API body size cap)
exports.createVideoUploadUrl = async (req, res) => {
    try {
        const { fileName, contentType } = req.body || {};
        const isVideo = (contentType && String(contentType).startsWith('video/')) ||
            /\.(mp4|webm|mov|m4v|ogg)$/i.test(String(fileName || ''));
        if (!fileName || !isVideo) {
            return res.status(400).json({ success: false, message: 'Please choose a video file (MP4, WebM or MOV).' });
        }
        const folder = String(req.body.folderName || 'products/videos').replace(/[^a-zA-Z0-9/_-]/g, '');
        const data = await storageService.createSignedUpload(folder, fileName);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error creating video upload URL:', error);
        res.status(500).json({ success: false, message: error.message || 'Could not prepare the video upload.' });
    }
};
