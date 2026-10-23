const cartService = require('../services/cartService');

const getUserId = (req) => {
    return req.user?.id || req.params?.userId || req.body?.userId || req.query?.userId || null;
};

exports.getCart = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const cart = await cartService.getCart(userId);
        res.status(200).json({ success: true, data: cart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.addToCart = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const { productId, quantity, setMode, size, selectedSize } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: 'Product ID is required' });
        }
        const chosenSize = size || selectedSize || 'M';
        const item = await cartService.addToCart(userId, productId, quantity || 1, !!setMode, chosenSize);
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.instantCheckout = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const { productId, quantity, size, selectedSize } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, message: 'Product ID is required' });
        }
        const chosenSize = size || selectedSize || 'M';
        const item = await cartService.addToCart(userId, productId, quantity || 1, true, chosenSize);
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateQuantity = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const { productId, quantity, size, selectedSize } = req.body;
        if (!productId || quantity === undefined) {
            return res.status(400).json({ success: false, message: 'Product ID and quantity are required' });
        }
        const chosenSize = size || selectedSize || null;
        const item = await cartService.updateQuantity(userId, productId, quantity, chosenSize);
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.removeFromCart = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const { productId } = req.params;
        const size = req.query?.size || req.body?.size || req.query?.selectedSize || null;
        const item = await cartService.removeFromCart(userId, productId, size);
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.clearCart = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        await cartService.clearCart(userId);
        res.status(200).json({ success: true, message: 'Cart cleared' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.syncCart = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const { localItems } = req.body;
        await cartService.syncCart(userId, localItems);
        res.status(200).json({ success: true, message: 'Cart synced' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

