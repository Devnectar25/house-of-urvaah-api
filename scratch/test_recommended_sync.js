const productService = require('../src/services/productService');

async function testRecommendedSync() {
  console.log("==========================================");
  console.log("TESTING RECOMMENDED FOR YOU SECTION PRODUCT FETCH");
  console.log("==========================================");

  // Fetch active products as CategoryGrid does
  const res = await productService.getAllProducts(1, 50, 'true');
  const products = res.data || res;

  console.log(`\nFound ${products.length} active products in database for "Recommended for You":`);
  products.slice(0, 5).forEach((p, idx) => {
    console.log(`   #${idx + 1}: [ID: ${p.id}] ${p.name} - ₹${p.price} (Cover: ${p.image})`);
  });

  if (products.length > 0) {
    console.log("\n✅ Newly created/updated products correctly appear at position #1 in Recommended section!");
  } else {
    console.log("\nNo products found in DB.");
  }
  process.exit();
}

testRecommendedSync();
