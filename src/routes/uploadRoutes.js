const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.post('/upload-image', uploadController.uploadMiddleware, uploadController.uploadImage);

// Large videos: the browser uploads straight to storage with this admin-issued signed link
router.post('/video-upload-url', express.json(), protect, authorize('admin'), uploadController.createVideoUploadUrl);

router.post('/upload-video', (req, res, next) => {
    uploadController.uploadVideoMiddleware(req, res, (err) => {
        if (err) {
            console.error("Multer Error during video upload:", err);
            return res.status(400).json({ 
                success: false, 
                message: "Upload failed at the middleware level",
                error: err.message 
            });
        }
        next();
    });
}, uploadController.uploadVideo);

router.delete('/delete-image', uploadController.deleteImage);
router.delete('/delete-video', uploadController.deleteImage); // Reusing deleteImage as it's generic
router.delete('/delete-folder', uploadController.deleteFolder);

module.exports = router;
