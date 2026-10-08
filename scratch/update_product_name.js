const pool = require('../src/config/db');
const supabase = require('../src/config/supabaseClient');

const newDesc = `A statement corset top in raw tissue silk, hand-embroidered with rich golden zari work and delicate sequin detailing throughout. Boned below the bust for structure, with soft padding for comfort and shape no additional support needed underneath.\nDesigned to be worn endlessly: pair it over a saree for a modern draped look, with a skirt for evening, or dress it down with jeans or palazzos for a statement daytime moment. One corset, however many ways you want to style it.\nClosure: adjustable lace-up back.`;

async function updateDatabase() {
    console.log('=== UPDATING PRODUCT NAME FOR 105 / OVERSIZED BLAZER TO CHESTNUT BLOOM SET ===');

    // 1. PostgreSQL pool update
    try {
        const res = await pool.query(`
            UPDATE products 
            SET title = 'CHESTNUT BLOOM SET', updated_at = NOW()
            WHERE product_id IN (101, 105) OR title ILIKE '%OVERSIZED BLAZER%';
        `);
        console.log('✅ PostgreSQL Update Result:', res.rowCount, 'rows updated.');
    } catch (err) {
        console.error('❌ PostgreSQL Update Error:', err.message);
    }

    // 2. Supabase client update
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('products')
                .update({ title: 'CHESTNUT BLOOM SET' })
                .or('product_id.in.(101,105),title.ilike.%OVERSIZED BLAZER%');
            if (error) {
                console.error('❌ Supabase Update Error:', error.message);
            } else {
                console.log('✅ Supabase Update Success:', data);
            }
        } catch (err) {
            console.error('❌ Supabase Catch Error:', err.message);
        }
    }

    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

updateDatabase();
