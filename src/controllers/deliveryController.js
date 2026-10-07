const pool = require('../config/db');

/**
 * Controller to check PIN code delivery availability and calculate dynamic delivery dates
 */
exports.checkDelivery = async (req, res) => {
  try {
    // 1. Support both query parameter (?pincode=411001) and URL parameter (/check/:pincode)
    const rawPincode = req.query.pincode || req.params.pincode || '';
    const cleanPin = String(rawPincode).trim();

    // 2. Strict 6-digit numeric validation
    if (!cleanPin) {
      return res.status(400).json({
        success: false,
        available: false,
        message: 'Please enter your PIN code.'
      });
    }

    if (!/^\d{6}$/.test(cleanPin)) {
      return res.status(400).json({
        success: false,
        available: false,
        message: 'Please enter a valid 6-digit PIN code.'
      });
    }

    // 3. Query PostgreSQL delivery_zones table
    const result = await pool.query(
      'SELECT * FROM delivery_zones WHERE pincode = $1 AND is_serviceable = true',
      [cleanPin]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        available: false,
        pincode: cleanPin,
        message: 'Sorry, delivery is currently unavailable for this PIN code.'
      });
    }

    const zoneRecord = result.rows[0];
    const minDays = parseInt(zoneRecord.delivery_min_days || 2, 10);
    const maxDays = parseInt(zoneRecord.delivery_max_days || 3, 10);

    // 4. Calculate dynamic delivery date in Asia/Kolkata timezone
    const getISTDate = (offsetDays) => {
      const now = new Date();
      // Adjust to IST timezone (UTC+5:30)
      const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
      const istNow = new Date(utcTime + 5.5 * 3600000);
      istNow.setDate(istNow.getDate() + offsetDays);
      return istNow;
    };

    const d1 = getISTDate(minDays);
    const d2 = getISTDate(maxDays);

    const getOrdinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return s[(v - 20) % 10] || s[v] || s[0];
    };

    const day1 = d1.getDate();
    const ord1 = getOrdinal(day1);
    const day2 = d2.getDate();
    const ord2 = getOrdinal(day2);

    const monthStr = d1.toLocaleString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' });

    const formatISODate = (d) => d.toISOString().split('T')[0];

    return res.json({
      success: true,
      available: true,
      pincode: cleanPin,
      zone: zoneRecord.zone || 'INDIA',
      city: zoneRecord.city,
      state: zoneRecord.state,
      estimatedDelivery: {
        from: formatISODate(d1),
        to: formatISODate(d2),
        day1,
        ord1,
        day2,
        ord2,
        month: monthStr,
        formatted: `${day1}${ord1} and ${day2}${ord2} ${monthStr}`
      }
    });
  } catch (error) {
    console.error('[DeliveryCheck Controller Error]:', error.message);
    return res.status(500).json({
      success: false,
      available: false,
      message: 'Unable to check delivery availability. Please try again.'
    });
  }
};
