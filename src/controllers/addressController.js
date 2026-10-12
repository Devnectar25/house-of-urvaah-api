const addressService = require('../services/addressService');

exports.getUserAddresses = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId || userId === 'undefined') {
            return res.status(400).json({ success: false, message: 'User ID is required and cannot be undefined' });
        }
        const addresses = await addressService.getAddressesByUserId(userId);
        res.status(200).json({ success: true, data: addresses });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createAddress = async (req, res) => {
    try {
        const payload = { ...req.body };
        if (!payload.user_id && req.user) {
            payload.user_id = req.user.id || req.user.username || req.user.email;
        }
        if (!payload.user_id || String(payload.user_id).trim() === '' || payload.user_id === 'undefined') {
            return res.status(400).json({ success: false, message: 'User ID is required to create address' });
        }
        const address = await addressService.addAddress(payload);
        res.status(201).json({ success: true, data: address });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const address = await addressService.updateAddress(id, req.body);
        res.status(200).json({ success: true, data: address });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;
        await addressService.deleteAddress(id);
        res.status(200).json({ success: true, message: 'Address deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
