const productService = require('../src/config/db');
const service = require('../src/services/productService');

async function createDemo() {
  try {
    const demoPayload = {
      title: "EMERALD ZARI SILK CORSET TOP",
      productname: "EMERALD ZARI SILK CORSET TOP",
      category_id: 1,
      subCategory: "Corset Tops",
      shortDescription: "Contoured silk corset top featuring delicate zari embroidery and sweetheart neckline.",
      description: "Handcrafted from pure Mulberry silk, this contour boned corset top features traditional hand-woven zari motifs, a structured sweetheart neckline, and a gold-finish zip closure at the back.",
      originalPrice: 14990,
      originalprice: 14990,
      discountPercent: 15,
      price: 12740,
      stockQuantity: 12,
      active: true,
      is_active: true,
      promoted: true,
      sizes: ["XS", "S", "M", "L"],
      colors: ["Emerald Green", "Antique Gold"],
      specifications: [
        { label: "Fabric", value: "100% Pure Mulberry Silk" },
        { label: "Fit Type", value: "Contoured Slim Fit" },
        { label: "Craftsmanship", value: "Hand Zari Embroidery" }
      ],
      careInstructions: "Dry clean only. Iron on low heat on reverse side.",
      care_instructions: "Dry clean only. Iron on low heat on reverse side.",
      images: [
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800",
        "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800"
      ],
      image: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800"
    };

    const res = await service.createProduct(demoPayload);
    console.log("✅ Demo product created successfully!");
    console.log("   ID:", res.id);
    console.log("   Name:", res.name);
    console.log("   Price:", res.price);
    console.log("   Storefront URL: /product/" + res.id);
  } catch (err) {
    console.error("Error creating demo product:", err);
  } finally {
    process.exit();
  }
}

createDemo();
