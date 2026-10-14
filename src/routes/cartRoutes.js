const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', cartController.getCart);
router.get('/:userId', cartController.getCart);
router.post('/add', cartController.addToCart);
router.post('/instant', cartController.instantCheckout);
router.patch('/update', cartController.updateQuantity);
router.delete('/clear', cartController.clearCart);
router.delete('/user/:userId', cartController.clearCart);
router.delete('/item/:productId', cartController.removeFromCart);
router.delete('/:param', (req, res) => {
    const param = req.params.param;
    if (param === 'clear') {
        return cartController.clearCart(req, res);
    }
    const cleanNum = String(param).replace(/\D/g, '');
    if (cleanNum && !isNaN(Number(cleanNum)) && !param.includes('@')) {
        req.params.productId = param;
        return cartController.removeFromCart(req, res);
    }
    return cartController.clearCart(req, res);
});
router.post('/sync', cartController.syncCart);

module.exports = router;

