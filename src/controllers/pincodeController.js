const pool = require('../config/db');

// Check pincode serviceability
exports.checkPincode = async (req, res) => {
  try {
    const { pincode } = req.params;

    // 1. Validation: 6 numeric digits
    if (!pincode || !/^\d{6}$/.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        serviceable: false,
        message: 'Please enter a valid 6-digit pincode.'
      });
    }

    const cleanPin = pincode.trim();

    // 2. Query DB
    const result = await pool.query(
      'SELECT * FROM serviceable_pincodes WHERE pincode = $1 AND is_active = true',
      [cleanPin]
    );

    if (result.rows.length > 0) {
      const pinData = result.rows[0];

      // Calculate estimate dates
      const today = new Date();
      const d1 = new Date(today);
      d1.setDate(today.getDate() + 3);
      const d2 = new Date(today);
      d2.setDate(today.getDate() + 4);

      const monthName = d1.toLocaleString('default', { month: 'short' });
      const getOrdinal = (n) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      };

      const dateStr = `${getOrdinal(d1.getDate())} and ${getOrdinal(d2.getDate())} ${monthName}`;

      return res.json({
        success: true,
        serviceable: true,
        pincode: cleanPin,
        city: pinData.city || 'India',
        message: `Express Delivery available to ${pinData.city || 'your area'}`,
        deliveryDate: dateStr
      });
    } else {
      return res.json({
        success: true,
        serviceable: false,
        pincode: cleanPin,
        message: 'Delivery is currently not available for this pincode.',
        deliveryDate: null
      });
    }
  } catch (error) {
    console.error('Error checking pincode:', error);
    return res.status(500).json({
      success: false,
      serviceable: false,
      message: 'Server error checking pincode'
    });
  }
};
