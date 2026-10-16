const pool = require('../config/db');

let cachedSettings = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

class SettingsService {
    /**
     * Parse row into typed settings object
     */
    formatSettings(row) {
        if (!row) {
            return {
                gst_percentage: 18,
                enable_tiered_gst: true,
                gst_threshold: 2500,
                gst_rate_below: 5,
                gst_rate_above: 18,
                card_charge_enabled: true,
                card_charge_percentage: 2,
                store_name: 'House of Urvaah',
                support_email: 'support@houseofurvaah.com',
                free_shipping_threshold: 2999,
                currency_symbol: '₹',
                maintenance_mode: false
            };
        }

        return {
            id: row.id,
            gst_percentage: parseFloat(row.gst_percentage) || 18,
            enable_tiered_gst: Boolean(row.enable_tiered_gst),
            gst_threshold: parseFloat(row.gst_threshold) || 2500,
            gst_rate_below: parseFloat(row.gst_rate_below) || 5,
            gst_rate_above: parseFloat(row.gst_rate_above) || 18,
            card_charge_enabled: Boolean(row.card_charge_enabled),
            card_charge_percentage: parseFloat(row.card_charge_percentage) || 2,
            store_name: row.store_name || 'House of Urvaah',
            support_email: row.support_email || 'support@houseofurvaah.com',
            free_shipping_threshold: parseFloat(row.free_shipping_threshold) || 2999,
            currency_symbol: row.currency_symbol || '₹',
            maintenance_mode: Boolean(row.maintenance_mode),
            updated_at: row.updated_at
        };
    }

    /**
     * Get active settings with caching
     */
    async getSettings(forceFresh = false) {
        const now = Date.now();
        if (!forceFresh && cachedSettings && (now - cacheTimestamp < CACHE_TTL_MS)) {
            return cachedSettings;
        }

        try {
            const res = await pool.query('SELECT * FROM public.store_settings WHERE id = 1 LIMIT 1');
            if (res.rows.length === 0) {
                // Ensure default exists
                await pool.query(`
                    INSERT INTO public.store_settings (id, gst_percentage, card_charge_percentage) 
                    VALUES (1, 18.00, 2.00) 
                    ON CONFLICT (id) DO NOTHING
                `);
                const seeded = await pool.query('SELECT * FROM public.store_settings WHERE id = 1 LIMIT 1');
                cachedSettings = this.formatSettings(seeded.rows[0]);
            } else {
                cachedSettings = this.formatSettings(res.rows[0]);
            }

            cacheTimestamp = now;
            return cachedSettings;
        } catch (err) {
            console.error('[SettingsService.getSettings] DB Error, using fallback:', err.message);
            return this.formatSettings(null);
        }
    }

    /**
     * Get settings visible to customer frontend (checkout, cart, headers)
     */
    async getPublicSettings() {
        const s = await this.getSettings();
        return {
            gst_percentage: s.gst_percentage,
            enable_tiered_gst: s.enable_tiered_gst,
            gst_threshold: s.gst_threshold,
            gst_rate_below: s.gst_rate_below,
            gst_rate_above: s.gst_rate_above,
            card_charge_enabled: s.card_charge_enabled,
            card_charge_percentage: s.card_charge_percentage,
            store_name: s.store_name,
            free_shipping_threshold: s.free_shipping_threshold,
            currency_symbol: s.currency_symbol,
            maintenance_mode: s.maintenance_mode
        };
    }

    /**
     * Update settings (Admin only)
     */
    async updateSettings(data) {
        const current = await this.getSettings(true);

        const gstPercentage = data.gst_percentage !== undefined 
            ? Math.max(0, Math.min(100, parseFloat(data.gst_percentage) || 0)) 
            : current.gst_percentage;

        const enableTieredGst = data.enable_tiered_gst !== undefined 
            ? Boolean(data.enable_tiered_gst) 
            : current.enable_tiered_gst;

        const gstThreshold = data.gst_threshold !== undefined 
            ? Math.max(0, parseFloat(data.gst_threshold) || 0) 
            : current.gst_threshold;

        const gstRateBelow = data.gst_rate_below !== undefined 
            ? Math.max(0, Math.min(100, parseFloat(data.gst_rate_below) || 0)) 
            : current.gst_rate_below;

        const gstRateAbove = data.gst_rate_above !== undefined 
            ? Math.max(0, Math.min(100, parseFloat(data.gst_rate_above) || 0)) 
            : current.gst_rate_above;

        const cardChargeEnabled = data.card_charge_enabled !== undefined 
            ? Boolean(data.card_charge_enabled) 
            : current.card_charge_enabled;

        const cardChargePercentage = data.card_charge_percentage !== undefined 
            ? Math.max(0, Math.min(50, parseFloat(data.card_charge_percentage) || 0)) 
            : current.card_charge_percentage;

        const storeName = data.store_name !== undefined ? String(data.store_name).trim() : current.store_name;
        const supportEmail = data.support_email !== undefined ? String(data.support_email).trim() : current.support_email;
        const freeShippingThreshold = data.free_shipping_threshold !== undefined 
            ? Math.max(0, parseFloat(data.free_shipping_threshold) || 0) 
            : current.free_shipping_threshold;
        const currencySymbol = data.currency_symbol !== undefined ? String(data.currency_symbol).trim() : current.currency_symbol;
        const maintenanceMode = data.maintenance_mode !== undefined ? Boolean(data.maintenance_mode) : current.maintenance_mode;

        const query = `
            UPDATE public.store_settings
            SET gst_percentage = $1,
                enable_tiered_gst = $2,
                gst_threshold = $3,
                gst_rate_below = $4,
                gst_rate_above = $5,
                card_charge_enabled = $6,
                card_charge_percentage = $7,
                store_name = $8,
                support_email = $9,
                free_shipping_threshold = $10,
                currency_symbol = $11,
                maintenance_mode = $12,
                updated_at = NOW()
            WHERE id = 1
            RETURNING *
        `;

        const values = [
            gstPercentage,
            enableTieredGst,
            gstThreshold,
            gstRateBelow,
            gstRateAbove,
            cardChargeEnabled,
            cardChargePercentage,
            storeName,
            supportEmail,
            freeShippingThreshold,
            currencySymbol,
            maintenanceMode
        ];

        const res = await pool.query(query, values);
        cachedSettings = this.formatSettings(res.rows[0]);
        cacheTimestamp = Date.now();

        return cachedSettings;
    }

    /**
     * Compute dynamic GST rate and amount based on taxable amount
     */
    async calculateGst(taxableAmount, customSettings = null) {
        const s = customSettings || await this.getSettings();
        const amt = Math.max(0, parseFloat(taxableAmount) || 0);

        let rate = s.gst_percentage;
        if (s.enable_tiered_gst) {
            rate = amt > s.gst_threshold ? s.gst_rate_above : s.gst_rate_below;
        }

        const taxAmount = amt > 0 ? Math.round(amt * (rate / 100)) : 0;
        return {
            rate,
            amount: taxAmount,
            isTiered: s.enable_tiered_gst,
            threshold: s.gst_threshold
        };
    }

    /**
     * Compute dynamic card payment surcharge
     */
    async calculateCardSurcharge(basePayable, isCardPayment, customSettings = null) {
        const s = customSettings || await this.getSettings();
        if (!isCardPayment || !s.card_charge_enabled) {
            return {
                enabled: s.card_charge_enabled,
                rate: 0,
                surcharge: 0
            };
        }

        const amt = Math.max(0, parseFloat(basePayable) || 0);
        const rate = s.card_charge_percentage;
        const surcharge = Math.round(amt * (rate / 100));

        return {
            enabled: true,
            rate,
            surcharge
        };
    }
}

module.exports = new SettingsService();
