const pool = require('../src/config/db');
const supabase = require('../src/config/supabaseClient');

const newDesc = `A statement corset top in raw tissue silk, hand-embroidered with rich golden zari work and delicate sequin detailing throughout. Boned below the bust for structure, with soft padding for comfort and shape no additional support needed underneath.\nDesigned to be worn endlessly: pair it over a saree for a modern draped look, with a skirt for evening, or dress it down with jeans or palazzos for a statement daytime moment. One corset, however many ways you want to style it.\nClosure: adjustable lace-up back.`;

async function updateDatabase() {
    console.log('=== UPDATING PRODUCT NAME FOR 109 TO Ivory Corset Kurti ===');

    // 1. PostgreSQL pool update
    try {
        const res = await pool.query(`
            UPDATE products 
            SET title = 'Ivory Corset Kurti', updated_at = NOW()
            WHERE product_id = 109 OR title ILIKE '%EMBROIDERED SILK KURTI%' OR title ILIKE '%Ivory Corset Kurti%';
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
                .update({ title: 'Ivory Corset Kurti' })
                .or('product_id.eq.109,title.ilike.%EMBROIDERED SILK KURTI%,title.ilike.%Ivory Corset Kurti%');
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
