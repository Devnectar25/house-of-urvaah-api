const settingsService = require('../services/settingsService');

/**
 * Public: Get customer-facing settings (GST rates, card surcharge, free shipping)
 */
exports.getPublicSettings = async (req, res) => {
    try {
        const settings = await settingsService.getPublicSettings();
        return res.status(200).json({
            success: true,
            data: settings
        });
    } catch (err) {
        console.error('[SettingsController.getPublicSettings] Error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve store settings.',
            error: err.message
        });
    }
};

/**
 * Admin: Get all settings
 */
exports.getAdminSettings = async (req, res) => {
    try {
        const settings = await settingsService.getSettings();
        return res.status(200).json({
            success: true,
            data: settings
        });
    } catch (err) {
        console.error('[SettingsController.getAdminSettings] Error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve admin settings.',
            error: err.message
        });
    }
};

/**
 * Admin: Update settings (GST rates, card surcharge, storefront config)
 */
exports.updateAdminSettings = async (req, res) => {
    try {
        const updated = await settingsService.updateSettings(req.body);
        return res.status(200).json({
            success: true,
            message: 'Store settings and tax configuration updated successfully.',
            data: updated
        });
    } catch (err) {
        console.error('[SettingsController.updateAdminSettings] Error:', err.message);
        return res.status(400).json({
            success: false,
            message: err.message || 'Failed to update store settings.'
        });
    }
};

/**
 * Public/Admin: Live calculation test helper
 */
exports.calculateTaxes = async (req, res) => {
    try {
        const amt = parseFloat(req.body.taxableAmount !== undefined ? req.body.taxableAmount : (req.body.amount || req.body.subtotal || 0)) || 0;
        const isCard = req.body.isCardPayment !== undefined 
            ? Boolean(req.body.isCardPayment) 
            : (String(req.body.paymentMethod || req.body.paymentType || '').toLowerCase().includes('card'));

        const gst = await settingsService.calculateGst(amt);
        const basePayable = amt + gst.amount;
        const card = await settingsService.calculateCardSurcharge(basePayable, isCard);

        return res.status(200).json({
            success: true,
            data: {
                taxableAmount: amt,
                gstRate: gst.rate,
                gstAmount: gst.amount,
                basePayable,
                cardSurchargeEnabled: card.enabled,
                cardSurchargeRate: card.rate,
                cardSurcharge: card.surcharge,
                grandTotal: basePayable + card.surcharge
            }
        });
    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
};
