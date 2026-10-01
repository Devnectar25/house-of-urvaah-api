const pool = require('../src/config/db');
const addressService = require('../src/services/addressService');
const orderService = require('../src/services/orderService');

async function runTest() {
    const testUserId = `test_user_sync_${Date.now()}`;
    console.log(`=== STARTING FULL ADDRESS SYNC TEST FOR USER: ${testUserId} ===\n`);

    try {
        // Step 0: Ensure user exists in users table
        await pool.query(
            "INSERT INTO public.users (username, emailid, fullname, contactno) VALUES ($1, $2, $3, $4)",
            [testUserId, `${testUserId}@example.com`, "Test User Sync", "9876543210"]
        );

        // Test 1: As a new user with no saved address, verify address list is empty
        const initialAddresses = await addressService.getAddressesByUserId(testUserId);
        console.log(`1. Initial user address count: ${initialAddresses.length}`);
        if (initialAddresses.length !== 0) throw new Error("Expected 0 addresses initially");

        // Simulate filling out address on Checkout & saving it
        console.log("   Submitting new address during Checkout with 'Save this address to my account' checked...");
        const addr1 = await addressService.addAddress({
            user_id: testUserId,
            address_label: "Home",
            full_address: "123 Marine Drive, Flat 4B",
            city: "Mumbai",
            state: "Maharashtra",
            postal_code: "400020",
            is_default: true,
            recipient_name: "Ananya Sharma",
            phone: "9876543210"
        });
        console.log(`   Created address ID: ${addr1.id}, is_default: ${addr1.is_default}`);

        // Confirm it now appears under Account -> Addresses
        const accountAddresses1 = await addressService.getAddressesByUserId(testUserId);
        console.log(`   Account addresses count after Checkout order: ${accountAddresses1.length}`);
        console.log(`   Saved Address details: Name=${accountAddresses1[0].recipient_name}, Phone=${accountAddresses1[0].phone}, Street=${accountAddresses1[0].full_address}`);
        if (accountAddresses1.length !== 1 || accountAddresses1[0].id !== addr1.id) {
            throw new Error("Test 1 Failed: Address added on Checkout did not appear in Account addresses!");
        }
        console.log("✓ TEST 1 PASSED: Address added on Checkout immediately appears under Account -> Addresses.\n");

        // Test 2: As a returning user, open Checkout — confirm the saved address is pre-filled/selected (is_default)
        const addressesForCheckout = await addressService.getAddressesByUserId(testUserId);
        const defaultShippingAddress = addressesForCheckout.find(a => a.is_default) || addressesForCheckout[0];
        console.log(`2. Opening Checkout for returning user...`);
        console.log(`   Pre-selected shipping address on Checkout: ID=${defaultShippingAddress.id}, Label=${defaultShippingAddress.address_label}, Address="${defaultShippingAddress.full_address}"`);
        if (!defaultShippingAddress || defaultShippingAddress.id !== addr1.id) {
            throw new Error("Test 2 Failed: Saved address was not pre-filled/selected on Checkout!");
        }
        console.log("✓ TEST 2 PASSED: Returning user on Checkout gets saved default address pre-filled/selected.\n");

        // Test 3: Add a second address from Account page, mark it default, open Checkout again
        console.log("3. Adding a second address from Account page & marking it as default...");
        const addr2 = await addressService.addAddress({
            user_id: testUserId,
            address_label: "Office",
            full_address: "456 BKC Commercial Complex, Tower B",
            city: "Mumbai",
            state: "Maharashtra",
            postal_code: "400051",
            is_default: true, // Marked as default
            recipient_name: "Ananya Sharma (Work)",
            phone: "9876543211"
        });
        console.log(`   Created second address ID: ${addr2.id}, is_default: ${addr2.is_default}`);

        // Re-fetch user addresses as Checkout would
        const updatedCheckoutAddresses = await addressService.getAddressesByUserId(testUserId);
        console.log(`   Total saved addresses in Account: ${updatedCheckoutAddresses.length}`);
        const newDefaultCheckoutAddress = updatedCheckoutAddresses.find(a => a.is_default) || updatedCheckoutAddresses[0];
        console.log(`   Checkout re-opened. Active pre-selected address: ID=${newDefaultCheckoutAddress.id}, Label=${newDefaultCheckoutAddress.address_label}, Address="${newDefaultCheckoutAddress.full_address}"`);

        if (newDefaultCheckoutAddress.id !== addr2.id) {
            throw new Error("Test 3 Failed: Newly marked default address was not selected on Checkout!");
        }
        console.log("✓ TEST 3 PASSED: New default address set from Account page is automatically pre-selected on Checkout!\n");

        // Clean up test data
        await pool.query("DELETE FROM public.user_addresses WHERE user_id = $1", [testUserId]);
        await pool.query("DELETE FROM public.users WHERE username = $1", [testUserId]);
        console.log("=== ALL 3 TEST SCENARIOS PASSED PERFECTLY ===");
    } catch (err) {
        console.error("TEST FAILED:", err);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

runTest();
