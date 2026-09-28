const pool = require('../src/config/db');

async function run() {
    try {
        console.log("Starting comprehensive schema sync...");

        // Columns for 'orders' table
        const orderCols = [
            { name: "is_returned_order", type: "BOOLEAN", def: "DEFAULT FALSE" },
            { name: "return_request_at", type: "TIMESTAMP WITH TIME ZONE", def: "" },
            { name: "return_type", type: "TEXT", def: "" },
            { name: "return_reason", type: "TEXT", def: "" },
            { name: "return_images", type: "TEXT[]", def: "DEFAULT '{}'" },
            { name: "refund_eligible_amount", type: "NUMERIC(10,2)", def: "DEFAULT 0" },
            { name: "cancel_reason", type: "TEXT", def: "" },
            { name: "rejection_reason", type: "TEXT", def: "" },
            { name: "refund_bank_account", type: "TEXT", def: "" },
            { name: "refund_ifsc_code", type: "TEXT", def: "" },
            { name: "refund_holder_name", type: "TEXT", def: "" }
        ];

        for (const col of orderCols) {
            const res = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = $1`, [col.name]);
            if (res.rows.length === 0) {
                console.log(`Adding ${col.name} to orders...`);
                const defSql = col.def ? ` ${col.def}` : '';
                await pool.query(`ALTER TABLE orders ADD COLUMN ${col.name} ${col.type}${defSql}`);
            }
        }

        // Columns for 'order_items' table
        const itemCols = [
            { name: "cancel_reason", type: "TEXT", def: "" },
            { name: "return_reason", type: "TEXT", def: "" },
            { name: "status", type: "TEXT", def: "" }
        ];

        for (const col of itemCols) {
            const res = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = $1`, [col.name]);
            if (res.rows.length === 0) {
                console.log(`Adding ${col.name} to order_items...`);
                const defSql = col.def ? ` ${col.def}` : '';
                await pool.query(`ALTER TABLE order_items ADD COLUMN ${col.name} ${col.type}${defSql}`);
            }
        }

        console.log("✅ Comprehensive schema sync completed!");
    } catch (err) {
        console.error("❌ Migration failed:", err);
    } finally {
        process.exit();
    }
}

run();
