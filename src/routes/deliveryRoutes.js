const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');

// Support both query parameter (/check?pincode=411001) and route parameter (/check/:pincode)
router.get('/check', deliveryController.checkDelivery);
router.get('/check/:pincode', deliveryController.checkDelivery);

module.exports = router;
