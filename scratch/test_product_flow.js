const pool = require('../src/config/db');
const productService = require('../src/services/productService');

async function testProductFlow() {
  console.log("==========================================");
  console.log("STARTING PRODUCT MANAGEMENT INTEGRATION TEST");
  console.log("==========================================");

  let createdProduct = null;
  let inactiveProduct = null;

  try {
    // 1. Create Active Product with full fields
    console.log("\n[TEST 1] Creating Active Product with full details...");
    const createPayload = {
      title: "ROYAL EMBROIDERED VELVET LEHENGA",
      productname: "ROYAL EMBROIDERED VELVET LEHENGA",
      category_id: 1,
      subCategory: "Bridal Wear",
      shortDescription: "Luxury handcrafted velvet lehenga ensemble with intricate zari work.",
      description: "Exquisite royal velvet lehenga crafted with artisanal zardosi embroidery, hand-sewn beads, and a fluid dupion silk inner lining.",
      originalPrice: 24990,
      originalprice: 24990,
      discountPercent: 20,
      price: 19992,
      stockQuantity: 15,
      active: true,
      is_active: true,
      promoted: true,
      sizes: ["S", "M", "L", "XL"],
      colors: ["Emerald Green", "Ruby Red"],
      specifications: [
        { label: "Fabric", value: "Velvet & Dupion Silk" },
        { label: "Embroidery", value: "Hand Zardosi & Sequins" }
      ],
      careInstructions: "Dry clean only. Store in a garment cover.",
      care_instructions: "Dry clean only. Store in a garment cover.",
      images: [
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800",
        "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800"
      ],
      image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800"
    };

    createdProduct = await productService.createProduct(createPayload);
    console.log("✅ Created product ID:", createdProduct.id);
    console.log("   Name:", createdProduct.name);
    console.log("   Price:", createdProduct.price, "| Original:", createdProduct.originalPrice, "| Discount:", createdProduct.discount + "%");
    console.log("   Sizes:", createdProduct.sizes);
    console.log("   Colors:", createdProduct.colors);
    console.log("   Specs:", createdProduct.specifications);
    console.log("   Care:", createdProduct.careInstructions);
    console.log("   Gallery:", createdProduct.gallery);

    // 2. Fetch created product by ID
    console.log("\n[TEST 2] Fetching Product by ID from Service...");
    const fetchedProduct = await productService.getProductById(createdProduct.id);
    if (!fetchedProduct) throw new Error("Failed to fetch created product by ID!");
    console.log("✅ Successfully fetched product ID", fetchedProduct.id);
    if (fetchedProduct.name !== createPayload.title) throw new Error("Name mismatch!");
    if (fetchedProduct.sizes.length !== 4) throw new Error("Sizes length mismatch!");
    if (fetchedProduct.specifications.length !== 2) throw new Error("Specifications length mismatch!");

    // 3. Edit / Update Product
    console.log("\n[TEST 3] Updating Product details...");
    const updatePayload = {
      price: 17990,
      originalPrice: 24990,
      discountPercent: 28,
      sizes: ["XS", "S", "M", "L", "XL"],
      colors: ["Emerald Green", "Ruby Red", "Royal Navy"],
      images: [
        "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800",
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800"
      ]
    };

    const updatedProduct = await productService.updateProduct(createdProduct.id, updatePayload);
    console.log("✅ Product updated successfully!");
    console.log("   Updated Price:", updatedProduct.price);
    console.log("   Updated Sizes:", updatedProduct.sizes);
    console.log("   Updated Cover Image (main):", updatedProduct.image);

    // 4. Create Inactive Product
    console.log("\n[TEST 4] Creating Inactive / Draft Product...");
    const inactivePayload = {
      title: "DRAFT INACTIVE SHIRT",
      productname: "DRAFT INACTIVE SHIRT",
      category_id: 1,
      price: 2990,
      active: false,
      is_active: false,
      images: ["https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800"]
    };
    inactiveProduct = await productService.createProduct(inactivePayload);
    console.log("✅ Created Inactive Product ID:", inactiveProduct.id, "| Active:", inactiveProduct.active);

    // 5. Test Active Filter for Storefront
    console.log("\n[TEST 5] Checking Storefront Active Filter...");
    const activeProductsList = await productService.getAllProducts(1, 100, 'true');
    const inactiveInActiveList = activeProductsList.data.find(p => p.id === inactiveProduct.id);
    const activeInActiveList = activeProductsList.data.find(p => p.id === createdProduct.id);

    if (inactiveInActiveList) {
      throw new Error("❌ BUG: Inactive product appeared in active products list!");
    } else {
      console.log("✅ Inactive product correctly hidden from active product queries.");
    }

    if (!activeInActiveList) {
      throw new Error("❌ BUG: Active product missing from active products list!");
    } else {
      console.log("✅ Active product correctly present in active product queries.");
    }

    console.log("\n==========================================");
    console.log("ALL INTEGRATION TESTS PASSED PERFECTLY! 🎉");
    console.log("==========================================");

  } catch (err) {
    console.error("❌ TEST FAILED:", err);
  } finally {
    // Cleanup test products
    if (createdProduct?.id) {
      await productService.deleteProduct(createdProduct.id);
      console.log(`\nCleaned up test product #${createdProduct.id}`);
    }
    if (inactiveProduct?.id) {
      await productService.deleteProduct(inactiveProduct.id);
      console.log(`Cleaned up test product #${inactiveProduct.id}`);
    }
    process.exit();
  }
}

testProductFlow();
