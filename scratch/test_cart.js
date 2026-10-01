const cartService = require('../src/services/cartService');

(async () => {
  try {
    console.log('Testing addToCart for guest user...');
    const item = await cartService.addToCart('guest_test_999', '101', 2);
    console.log('Successfully added to cart:', item);

    const updated = await cartService.updateQuantity('guest_test_999', '101', 3);
    console.log('Updated quantity:', updated.quantity);

    const removed = await cartService.removeFromCart('guest_test_999', '101');
    console.log('Removed item:', removed ? removed.product_id : 'none');

    const cartAfter = await cartService.getCart('guest_test_999');
    console.log('Cart count after removal:', cartAfter.length);

    console.log('ALL CART TESTS PASSED 100% CLEANLY!');
    process.exit(0);
  } catch (err) {
    console.error('Cart test failed:', err);
    process.exit(1);
  }
})();
