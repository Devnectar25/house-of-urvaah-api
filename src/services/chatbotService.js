const pool = require('../config/db');
const productService = require('./productService');
const groqService = require('./groqService');

/**
 * Chatbot Service — Enhanced NLP Pipeline
 * ─────────────────────────────────────────
 * Pipeline stages (in order):
 *  1.   Sanitize & tokenize the raw query
 *  2.   Detect "alternative product" intent (needs session context)
 *  3.   Detect greetings / farewells
 *  4.   Detect price-filter intents (regex)
 *  4.5  Detect product listing intent ← "show me products", "list corsets"
 *  5.   Detect company/people info intent
 *  6.   Detect navigation/static intents (regex)
 *  7.   Knowledge-base lookup (DB regex matching)
 *  8.   Direct product search (ILIKE) — only for product-likely queries
 *  9.   Keyword-level product search
 *  10.  Fuzzy product search
 *  11.  Groq LLM Fashion Concierge (3-key fallback switch, website-only scope)
 */

// ─── In-Memory Session Context ────────────────────────────────────────────────
// Stores per-session: last products shown, last search keyword, last category, conversation history
// Expires after 30 minutes of inactivity.

const sessionStore = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getSession(sessionId) {
    const s = sessionStore.get(sessionId);
    if (!s) return { lastProducts: [], lastKeyword: '', lastCategory: '', lastQuery: '', history: [] };
    if (!s.history) s.history = [];
    return s;
}

function setSession(sessionId, data) {
    sessionStore.set(sessionId, { ...getSession(sessionId), ...data, _ts: Date.now() });
}

// Cleanup expired sessions every 15 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessionStore.entries()) {
        if (now - (s._ts || 0) > SESSION_TTL_MS) sessionStore.delete(id);
    }
}, 15 * 60 * 1000);

// ─── NLP Helpers ──────────────────────────────────────────────────────────────

/**
 * Tokenize a query into lowercase words, removing punctuation.
 */
function tokenize(text) {
    return text
        .toLowerCase()
        // Support English, Hindi (\u0900-\u097F), and Punjabi (\u0A00-\u0A7F)
        .replace(/[^a-z0-9\s\u0900-\u097F\u0A00-\u0A7F]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * Detect the most likely intent using keyword scoring.
 */
function detectIntentFromTokens(tokens) {
    const intentKeywords = {
        greeting: ['hello', 'hi', 'hey', 'hii', 'helo', 'greetings', 'नमस्ते', 'नमस्कार', 'हेल्लो', 'हाय', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'ਹੈਲੋ', 'ਸਤਿ', 'ਸ੍ਰੀ'],
        farewell: ['bye', 'goodbye', 'thanks', 'thank', 'later', 'अलविदा', 'धन्यवाद', 'शुक्रिया', 'नमस्ते', 'ਅਲਵਿਦਾ', 'ਧੰਨਵਾਦ', 'ਸ਼ੁਕਰੀਆ'],
        alternative: ['another', 'other', 'else', 'different', 'more', 'next', 'alternatives', 'similar', 'suggest', 'दूसरा', 'अन्य', 'और', 'अलग', 'विकल्प', 'ਹੋਰ', 'ਦੂਜਾ', 'ਵਿਕਲਪ'],
        product_search: ['find', 'search', 'show', 'list', 'give', 'suggest', 'recommend', 'need', 'want', 'looking', 'buy', 'purchase', 'खोजें', 'दिखाएं', 'सूची', 'दें', 'चाहिए', 'खरीदना', 'ਖੋਜੋ', 'ਦਿਖਾਓ', 'ਸੂਚੀ', 'ਚਾਹੀਦਾ', 'ਖਰੀਦੋ'],
        health_query: ['stress', 'anxiety', 'sleep', 'insomnia', 'immunity', 'immune', 'digestion', 'stomach', 'pain', 'joint', 'arthritis', 'तनाव', 'चिंता', 'नींद', 'प्रतिरक्षा', 'पाचन', 'पेट', 'दर्द', 'गठिया', 'ਤਣਾਅ', 'ਚਿੰਤਾ', 'ਨੀਂਦ', 'ਪਾਚਨ', 'ਦਰਦ'],
        pricing_info: ['price', 'cost', 'expensive', 'cheap', 'affordable', 'budget', 'कीमत', 'मूल्य', 'कितना', 'सस्ता', 'महंगा', 'बजट', 'ਕੀਮਤ', 'ਮੁੱਲ', 'ਕਿੰਨਾ', 'ਸਸਤਾ', 'ਮਹਿੰਗਾ'],
        website_info: ['order', 'shipping', 'delivery', 'return', 'refund', 'payment', 'checkout', 'track', 'size', 'sizing', 'fabric', 'care', 'ऑर्डर', 'शिपिंग', 'डिलिवरी', 'वापसी', 'भुगतान', 'ट्रैक', 'ਆਰਡਰ', 'ਸ਼ਿਪਿੰਗ', 'ਵਾਪਸੀ', 'ਭੁਗਤਾਨ'],
        contact_info: ['contact', 'support', 'email', 'phone', 'call', 'help', 'संपर्क', 'सहायता', 'ईमेल', 'फोन', 'कॉल', 'मदद', 'ਸੰਪਰਕ', 'ਸਹਾਇਤਾ', 'ਮਦਦ'],
        about_info: ['about', 'company', 'urvaah', 'house', 'founder', 'owner', 'ceo', 'team', 'brand', 'atelier', 'बारे', 'कंपनी', 'मालिक', 'संस्थापक', 'ਬਾਰੇ', 'ਮਾਲਕ'],
    };

    const scores = {};
    for (const [intent, keywords] of Object.entries(intentKeywords)) {
        scores[intent] = 0;
        for (const token of tokens) {
            if (keywords.includes(token)) scores[intent]++;
        }
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const best = sorted[0];
    if (!best || best[1] === 0) return { intent: 'unknown', confidence: 0 };

    const confidence = Math.min(best[1] / 3, 1.0);
    return { intent: best[0], confidence };
}

/**
 * Extract meaningful keywords from tokens (remove stop words).
 */
function extractKeywords(tokens) {
    const stopWords = new Set([
        'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for',
        'of', 'and', 'or', 'but', 'with', 'do', 'i', 'me', 'my', 'we',
        'you', 'he', 'she', 'they', 'this', 'that', 'are', 'was', 'be',
        'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should',
        'what', 'which', 'who', 'how', 'when', 'where', 'please', 'tell',
        'about', 'any', 'some', 'get', 'give', 'show', 'want', 'need',
        'just', 'also', 'else', 'other', 'another',
        'का', 'की', 'के', 'में', 'पर', 'से', 'को', 'है', 'हैं', 'था', 'थी', 'थे',
        'और', 'या', 'भी', 'कि', 'तो', 'ही', 'लिए', 'बारे', 'क्या', 'कौन', 'कैसे',
        'ਕਾ', 'ਕੀ', 'ਕੇ', 'ਵਿੱਚ', 'ਪਰ', 'ਸੇ', 'ਨੂੰ', 'ਹੈ', 'ਹਨ', 'ਸੀ', 'ਅਤੇ', 'ਜਾਂ', 'ਵੀ', 'ਲਈ',
        'ਕਹਾਂ', 'ਕਬ', 'ਕਿਉਂ', 'ਕਿਰਪਾ', 'ਦੱਸੋ', 'ਦਿਖਾਓ', 'ਚਾਹੀਦਾ', 'ਦੇ'
    ]);
    return tokens.filter(t => t.length > 1 && !stopWords.has(t));
}
function normalizeKeyword(keyword) {
    if (!keyword) return '';
    let kw = keyword.toLowerCase().trim();
    if (kw.endsWith('s') && kw.length > 4 && !kw.endsWith('ss')) {
        kw = kw.slice(0, -1);
    }
    const mapping = {
        'corsets': 'corset',
        'kurtis': 'kurti',
        'dresses': 'dress',
        'suits': 'suit',
        'blazers': 'blazer',
        'skirts': 'skirt',
        'tops': 'top',
        'sets': 'set',
        'co-ords': 'co-ord',
        'coords': 'co-ord',
        'sarees': 'saree',
        'blouses': 'blouse',
        'कोर्सेट': 'corset',
        'कुर्ती': 'kurti',
        'साड़ी': 'saree',
        'ड्रेस': 'dress',
        'ब्लाउज': 'blouse'
    };
    return mapping[keyword] || mapping[kw] || kw;
}

/**
 * Basic transliteration/translation for English text to Hindi/Punjabi script.
 * Focuses on Ayurvedic product names and common health terms.
 */
function localizeText(text, language) {
    if (!text || language === 'en') return text;

    const dictionary = {
        'ashwagandha': { hi: 'अश्वगंधा', pa: 'ਅਸ਼ਵਗੰਧਾ' },
        'triphala': { hi: 'त्रिफला', pa: 'ਤ੍ਰਿਫਲਾ' },
        'brahmi': { hi: 'ब्राह्मी', pa: 'ਬ੍ਰਾਹਮੀ' },
        'shatavari': { hi: 'शतावरी', pa: 'ਸ਼ਤਾਵਰੀ' },
        'giloy': { hi: 'गिलोय', pa: 'ਗਿਲੋਏ' },
        'amla': { hi: 'आंवला', pa: 'ਆਮਲਾ' },
        'shilajit': { hi: 'शिलाजीत', pa: 'ਸ਼ਿਲਾਜੀਤ' },
        'turmeric': { hi: 'हल्दी', pa: 'ਹਲਦੀ' },
        'tulsi': { hi: 'तुलसी', pa: 'ਤੁਲਸੀ' },
        'churna': { hi: 'चूर्ण', pa: 'ਚੂਰਨ' },
        'oil': { hi: 'तेल', pa: 'ਤੇਲ' },
        'capsule': { hi: 'कैप्सूल', pa: 'ਕੈਪਸੂਲ' },
        'capsules': { hi: 'कैप्सूल', pa: 'ਕੈਪਸੂਲ' },
        'tablet': { hi: 'गोली', pa: 'ਗੋਲੀ' },
        'tablets': { hi: 'गोलियां', pa: 'ਗੋਲੀਆਂ' },
        'syrup': { hi: 'सिरप', pa: 'ਸੀਰਪ' },
        'powder': { hi: 'पाउडर', pa: 'ਪਾਊਡਰ' },
        'neem': { hi: 'नीम', pa: 'ਨੀਮ' },
        'honey': { hi: 'शहद', pa: 'ਸ਼ਹਿਦ' },
        'ayurvedic': { hi: 'आयुर्वेदिक', pa: 'ਆਯੁਰਵੈਦਿਕ' },
        'product': { hi: 'उत्पाद', pa: 'ਉਤਪਾਦ' },
        'products': { hi: 'उत्पाद', pa: 'ਉਤਪਾਦ' },
        'price': { hi: 'कीमत', pa: 'ਕੀਮਤ' },
        'health': { hi: 'स्वास्थ्य', pa: 'ਸਿਹਤ' },
        'immunity': { hi: 'रोग प्रतिरोधक क्षमता', pa: 'ਰੋਗ ਪ੍ਰਤੀਰੋਧਕ ਸ਼ਕਤੀ' },
        'digestion': { hi: 'पाचन', pa: 'ਪਾਚਨ' },
        'stress': { hi: 'तनाव', pa: 'ਤਣਾਅ' },
        'pain': { hi: 'दर्द', pa: 'ਦਰਦ' }
    };

    let localized = text;
    
    // Replace whole words from dictionary
    Object.entries(dictionary).forEach(([en, local]) => {
        const regex = new RegExp(`\\b${en}\\b`, 'gi');
        localized = localized.replace(regex, local[language] || en);
    });

    // Simple phonetic fallback for common Ayurvedic suffixes and patterns
    if (language === 'hi') {
        localized = localized
            .replace(/veda/gi, 'वेद')
            .replace(/veda/gi, 'वेदा')
            .replace(/home/gi, 'होम')
            .replace(/medi/gi, 'मेडी');
    } else if (language === 'pa') {
        localized = localized
            .replace(/veda/gi, 'ਵੇਦ')
            .replace(/home/gi, 'ਹੋਮ')
            .replace(/medi/gi, 'ਮੇਡੀ');
    }

    return localized;
}

/**
 * Heuristic: is this query likely about a product (vs. company/general info)?
 * Returns false for queries that are clearly not product searches.
 */
function isLikelyProductQuery(lowerQuery, tokens) {
    // ── Pre-check: House of Urvaah Fashion Keywords ──
    const fashionTerms = [
        'corset', 'kurti', 'dress', 'set', 'bloom', 'silk', 'cora', 'cotton', 'blazer', 'skirt',
        'co-ord', 'floral', 'gilded', 'rosewood', 'chestnut', 'teal', 'top', 'bottom', 'palazzo',
        'saree', 'embroidery', 'lace', 'trench', 'zari', 'sequin', 'potli', 'couture', 'atelier',
        'peach', 'ivory', 'blouse', 'clothes', 'clothing', 'garment', 'fashion', 'collection',
        'कुर्ती', 'साड़ी', 'ड्रेस', 'सेट', 'सिल्क', 'ब्लाउज'
    ];
    const containsIndic = /[\u0900-\u097F\u0A00-\u0A7F]/.test(lowerQuery);
    const hasFashionTerm = tokens.some(t => fashionTerms.includes(t.toLowerCase()));
    if (hasFashionTerm || containsIndic) return true;

    // ── Intent Check ──
    const { intent } = detectIntentFromTokens(tokens);
    const productIntents = ['product_search', 'product_info', 'product_listing', 'pricing_info'];
    const isExplicitProductIntent = productIntents.includes(intent);

    // If it's a short query and not an explicit product intent or fashion term, block it
    if (tokens.length < 3 && !isExplicitProductIntent && !hasFashionTerm) return false;

    // Patterns that signal a NON-product query — block product search for these
    const nonProductPatterns = [
        /who\s+(is|are|was|owns|founded|runs|leads)/i,
        /\b(owner|founder|ceo|director|president|chairman|manager|head)\b/i,
        /^(what|how|where|when|why)\s+(is|are|was|were|do|does)\b(?!.*(product|corset|kurti|dress|suit|blazer|skirt|top|bloom|silk|clothing|collection|brand))/i,
        /\b(is|are|was|were|do|does)\b.*\b(you|your|me|my)\b(?!.*(product|dress|corset|kurti))/i,
        /tell\s+me\s+about\s+(urvaah|house\s+of\s+urvaah|the\s+company|your\s+company)/i,
        /\b(when\s+was|when\s+did|how\s+many\s+employees|headquarters|location|address\s+of)\b/i,
    ];

    for (const pattern of nonProductPatterns) {
        if (pattern.test(lowerQuery)) return false;
    }

    return isExplicitProductIntent;
}

/**
 * Check if query expresses an "alternative product" request.
 */
function isAlternativeRequest(lowerQuery) {
    const patterns = [
        /\b(another|other|different|else|alternative|alternatives)\b.*\bproduct/i,
        /\bproduct\b.*\b(another|other|different|else|alternative)\b/i,
        /show\s+me\s+(another|more|other|different|some\s+more)/i,
        /any\s+(other|more|alternative|different)\s+(product|option|item)/i,
        /\b(next|more)\s+(product|option|suggestion|result)/i,
        /don't\s+(like|want)\s+(this|that|it)[,.]?\s*(show|give|suggest|any)/i,
        /something\s+(else|different|other|more)/i,
        /\b(दूसरा|अन्य|अलग|विकल्प|और)\b.*\b(उत्पाद|आइटम|चीज)/i,
        /(दिखाएं|दिखाओ|दिखाइए)\s+.*(और|दूसरा|अन्य)/i,
    ];
    return patterns.some(p => p.test(lowerQuery));
}

/**
 * Detect a product listing intent and extract any category/type keyword.
 *
 * Returns { isListing: true, keyword: string, isGeneral: boolean }
 * or null when the query is NOT a product listing request.
 *
 * Examples:
 *   "show me products"           → { isListing: true, keyword: '',          isGeneral: true  }
 *   "show me ayurvedic products" → { isListing: true, keyword: 'ayurvedic', isGeneral: false }
 *   "list herbal items"          → { isListing: true, keyword: 'herbal',    isGeneral: false }
 *   "what products do you have"  → { isListing: true, keyword: '',          isGeneral: true  }
 */
function detectProductListingIntent(query) {
    const q = query.toLowerCase().trim();

    // ── General listing patterns (no category) ────────────────────────────────
    const generalPatterns = [
        /^show\s*(?:me\s*)?(?:all\s*)?(?:your\s*)?(?:available\s*)?products?$/i,
        /^list\s*(?:all\s*)?(?:your\s*)?(?:available\s*)?products?$/i,
        /^display\s*(?:all\s*)?(?:your\s*)?(?:available\s*)?products?$/i,
        /^view\s*(?:all\s*)?(?:your\s*)?(?:available\s*)?products?$/i,
        /^(?:get|give\s*me)\s*(?:all\s*)?(?:your\s*)?(?:available\s*)?products?$/i,
        /^show\s*(?:me\s*)?(?:all\s*)?(?:available\s*)?items?$/i,
        /^list\s*(?:all\s*)?(?:available\s*)?items?$/i,
        /^display\s*(?:all\s*)?(?:available\s*)?items?$/i,
        /^view\s*(?:all\s*)?(?:available\s*)?items?$/i,
        /^what\s+products?\s+(?:do\s+you\s+have|are\s+available|can\s+i\s+(?:get|buy)|you\s+sell)/i,
        /^(?:show|view)\s+(?:all\s+)?(?:product\s+)?catalog(?:ue)?$/i,
        /^(?:available|all)\s+products?$/i,
        /^product\s+list$/i,
        /^products?$/i,
        /^(?:show|display|view)\s+(?:all\s+)?inventory$/i,
        /^browse\s+(?:all\s+)?products?$/i,
        /^find\s+(?:all\s+)?products?$/i,
        /^do\s+you\s+have\s+(?:any\s+)?products?/i,
        /^what\s+(?:do\s+you\s+sell|are\s+your\s+products?)/i,
        // Hindi patterns
        /^(?:दिखाएं|दिखाओ|दिखाइए)\s+(?:सभी\s+)?(?:आपके\s+)?(?:उपलब्ध\s+)?(?:उत्पाद|आइटम)$/i,
        /^(?:सूची|लिस्ट)\s+(?:बनाएं|दिखाएं)\s+(?:सभी\s+)?(?:उत्पाद|आइटम)$/i,
        /^क्या\s+(?:उत्पाद|आइटम)\s+(?:उपलब्ध|हैं)/i,
        /^(?:सभी\s+)?उत्पाद$/i,
    ];

    for (const p of generalPatterns) {
        if (p.test(q)) return { isListing: true, keyword: '', isGeneral: true };
    }

    // ── Category-specific listing patterns ────────────────────────────────────
    // e.g. "show me ayurvedic products", "list herbal items", "find immunity products"
    const categoryPatterns = [
        // show/list/display/find/get [me] [all] [your] [available] <KEYWORD> [products/items]
        /(?:show|list|display|find|get|search|browse|explore|see)\s+(?:me\s+)?(?:all\s+)?(?:your\s+)?(?:available\s+)?([\w]+(?:\s+[\w]+)?)\s*(?:products?|items?)?$/i,
        // products for/related to/about <KEYWORD>
        /products?\s+(?:for|related\s+to|about|in)\s+([\w]+(?:\s+[\w]+)?)/i,
        // do you have <KEYWORD> products
        /(?:do\s+you\s+have|got\s+any|have\s+any)\s+([\w]+(?:\s+[\w]+)?)\s+products?/i,
        // Hindi category patterns
        /(?:दिखाएं|दिखाओ|दिखाइए|खोजें)\s+(?:सभी\s+)?([\u0900-\u097F\w]+(?:\s+[\u0900-\u097F\w]+)?)\s+(?:उत्पाद|आइटम)/i,
        /([\u0900-\u097F\w]+(?:\s+[\u0900-\u097F\w]+)?)\s+(?:के\s+)?(?:उत्पाद|आइटम)/i,
    ];

    // Words that are NOT real category keywords — if the extracted keyword is
    // one of these, fall back to a general listing.
    const skipKeywords = new Set([
        'all', 'your', 'available', 'some', 'the', 'any', 'me',
        'product', 'products', 'item', 'items', 'show', 'list',
        'good', 'best', 'top', 'nice', 'great', 'new', 'more',
        'cheap', 'affordable', 'popular', 'latest', 'featured',
    ]);

    for (const p of categoryPatterns) {
        const match = q.match(p);
        if (match && match[1]) {
            const keyword = match[1].trim().toLowerCase();
            // Multi-word: only accept if all words are meaningful
            const words = keyword.split(/\s+/);
            const allMeaningful = words.every(w => w.length > 2 && !skipKeywords.has(w));

            if (allMeaningful && keyword.length > 2) {
                return { isListing: true, keyword, isGeneral: false };
            }
            // Keyword was too generic (like "show me all products") → treat as general listing
            return { isListing: true, keyword: '', isGeneral: true };
        }
    }

    // ── Direct single word listing (e.g. "ayurvedic", "herbal") ────────────────
    const singleWords = q.split(/\s+/);
    if (singleWords.length === 1 && !skipKeywords.has(singleWords[0]) && singleWords[0].length >= 3) {
        // Check if it's a known intent like 'greeting' etc.
        const { intent } = detectIntentFromTokens([singleWords[0]]);
        if (intent === 'unknown' || intent === 'product_search') {
            return { isListing: true, keyword: singleWords[0], isGeneral: false };
        }
    }

    return null; // not a product listing query
}

// ─── Unanswered Query Logger ───────────────────────────────────────────────────

async function logUnansweredQuery(query, suggestedIntent = 'unknown') {
    try {
        const sql = `
            INSERT INTO chatbot_unanswered_queries (query, suggested_intent, occurrence_count)
            VALUES ($1, $2, 1)
            ON CONFLICT (query)
            DO UPDATE SET
                occurrence_count = chatbot_unanswered_queries.occurrence_count + 1,
                updated_at = CURRENT_TIMESTAMP
        `;
        await pool.query(sql, [query.toLowerCase().trim(), suggestedIntent]);
        console.log(`📝 Logged unanswered query: "${query}"`);
    } catch (err) {
        console.error('Unanswered query log error:', err.message);
    }
}

// ─── Product Click Logger ─────────────────────────────────────────────────────

async function logProductClick(productId, productName, sessionId = 'default') {
    try {
        // Create table if not exists (for this specific story)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chatbot_product_clicks (
                id SERIAL PRIMARY KEY,
                product_id VARCHAR(50) NOT NULL,
                product_name TEXT,
                session_id VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const sql = `
            INSERT INTO chatbot_product_clicks (product_id, product_name, session_id)
            VALUES ($1, $2, $3)
        `;
        await pool.query(sql, [productId, productName, sessionId]);
        console.log(`📊 Logged click for product: ${productName} (${productId})`);
    } catch (err) {
        console.error('Product click log error:', err.message);
    }
}

// ─── Alternative Products Helper ──────────────────────────────────────────────

/**
 * Fetch alternative products excluding the IDs already shown this session.
 * Tries same keyword first, then same category, then random popular products.
 */
async function getAlternativeProducts(session) {
    const excludeIds = (session.lastProducts || []).map(p => p.id).filter(Boolean);
    const keyword = session.lastKeyword || '';
    const category = session.lastCategory || '';

    // Build exclusion clause
    const excludeSql = excludeIds.length > 0
        ? `AND p.product_id NOT IN (${excludeIds.map((_, i) => `$${i + 2}`).join(',')})`
        : '';

    // 1. Same keyword, different products
    if (keyword) {
        try {
            const sql = `
                SELECT p.*, c.name as category_name, b.name as brand_name, sc.name as subcategory_name
                FROM products p
                LEFT JOIN category c ON p.category_id = c.category_id
                LEFT JOIN brand b ON p.brand = b.brand_id
                LEFT JOIN subcategory sc ON p.subcategory_id = sc.srno
                WHERE p.active = true
                  AND (p.productname ILIKE $1 OR p.description ILIKE $1 OR c.name ILIKE $1)
                  ${excludeSql}
                ORDER BY RANDOM()
                LIMIT 5
            `;
            const params = [`%${keyword}%`, ...excludeIds];
            const result = await pool.query(sql, params);
            if (result.rows.length > 0) {
                return result.rows.map(r => ({
                    id: r.product_id?.toString() || '',
                    name: r.productname || '',
                    price: parseFloat(r.price) || 0,
                    image: r.image || 'https://via.placeholder.com/300',
                    rating: parseFloat(r.rating) || 0,
                    inStock: r.instock,
                    description: r.shortdescription || r.description || '',
                }));
            }
        } catch (e) { /* fall through */ }
    }

    // 2. Same category, different products
    if (category) {
        try {
            const sql = `
                SELECT p.*, c.name as category_name, b.name as brand_name, sc.name as subcategory_name
                FROM products p
                LEFT JOIN category c ON p.category_id = c.category_id
                LEFT JOIN brand b ON p.brand = b.brand_id
                LEFT JOIN subcategory sc ON p.subcategory_id = sc.srno
                WHERE p.active = true
                  AND (c.name ILIKE $1 OR p.category_id::text = $1)
                  ${excludeSql}
                ORDER BY RANDOM()
                LIMIT 5
            `;
            const params = [`%${category}%`, ...excludeIds];
            const result = await pool.query(sql, params);
            if (result.rows.length > 0) {
                return result.rows.map(r => ({
                    id: r.product_id?.toString() || '',
                    name: r.productname || '',
                    price: parseFloat(r.price) || 0,
                    image: r.image || 'https://via.placeholder.com/300',
                    rating: parseFloat(r.rating) || 0,
                    inStock: r.instock,
                    description: r.shortdescription || r.description || '',
                }));
            }
        } catch (e) { /* fall through */ }
    }

    // 3. Popular/promoted products as last resort
    try {
        const sql = `
            SELECT p.*, c.name as category_name, b.name as brand_name, sc.name as subcategory_name
            FROM products p
            LEFT JOIN category c ON p.category_id = c.category_id
            LEFT JOIN brand b ON p.brand = b.brand_id
            LEFT JOIN subcategory sc ON p.subcategory_id = sc.srno
            WHERE p.active = true ${excludeSql.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) - 1}`)}
            ORDER BY p.promoted DESC, p.rating DESC
            LIMIT 5
        `;
        // Rebuild for no-keyword case
        const result = await pool.query(
            `SELECT p.*, c.name as category_name, b.name as brand_name, sc.name as subcategory_name
            FROM products p
            LEFT JOIN category c ON p.category_id = c.category_id
            LEFT JOIN brand b ON p.brand = b.brand_id
            LEFT JOIN subcategory sc ON p.subcategory_id = sc.srno
            WHERE p.active = true
            ORDER BY p.promoted DESC, p.rating DESC NULLS LAST
            LIMIT 8`
        );
        const rows = result.rows.filter(r => !excludeIds.includes(r.product_id?.toString())).slice(0, 5);
        return rows.map(r => ({
            id: r.product_id?.toString() || '',
            name: r.productname || '',
            price: parseFloat(r.price) || 0,
            image: r.image || 'https://via.placeholder.com/300',
            rating: parseFloat(r.rating) || 0,
            inStock: r.instock,
            description: r.shortdescription || r.description || '',
        }));
    } catch (e) {
        return [];
    }
}

// ─── Main NLP Query Processor ─────────────────────────────────────────────────

/**
 * Process a user query through the full NLP pipeline.
 * Always returns a response — never leaves the user unanswered.
 *
 * @param {string} query
 * @param {string} sessionId  — used to track conversation context
 * @param {string} language   — preferred language ('en' or 'hi')
 */
exports.processQuery = async (query, sessionId = 'default', language = 'en') => {
    if (!query) {
        return {
            answer: language === 'hi' ? "क्षमा करें, मुझे इस बारे में अधिक जानकारी नहीं है।" : "Sorry, we don't have too much knowledge about that.",
            intent: 'fallback',
            confidence: 0.0,
            products: []
        };
    }

    const sanitizedQuery = query.trim();
    const lowerQuery = sanitizedQuery.toLowerCase();
    const session = getSession(sessionId);

    // ── Stage 1: Tokenize & Extract Keywords ─────────────────────────────────
    const tokens = tokenize(sanitizedQuery);
    const keywords = extractKeywords(tokens);
    const { intent: detectedIntent } = detectIntentFromTokens(tokens);

    console.log(`🧠 NLP | "${sanitizedQuery}" | tokens: [${tokens.slice(0, 8).join(', ')}] | intent: ${detectedIntent}`);

    // ── Stage 2: Alternative Product Request ─────────────────────────────────
    if (isAlternativeRequest(lowerQuery)) {
        const alternatives = await getAlternativeProducts(session);

        if (alternatives.length > 0) {
            // Update session: add newly shown product IDs to exclusion list
            const allShown = [
                ...(session.lastProducts || []),
                ...alternatives,
            ].slice(-20); // keep last 20 shown
            setSession(sessionId, { lastProducts: allShown });

            return {
                answer: session.lastKeyword
                    ? (language === 'hi' ? `यहाँ आपके लिए कुछ वैकल्पिक "${session.lastKeyword}" उत्पाद हैं:` : `Here are some alternative "${session.lastKeyword}" products for you:`)
                    : (language === 'hi' ? `यहाँ कुछ अन्य उत्पाद हैं जो आपको पसंद आ सकते हैं:` : `Here are some other products you might like:`),
                intent: 'alternative_request',
                confidence: 1.0,
                products: alternatives
            };
        }

        return {
            answer: language === 'hi' 
                ? "क्षमा करें, मेरे पास अभी कोई और उत्पाद सुझाव नहीं हैं।\nकिसी अन्य उत्पाद या श्रेणी के बारे में पूछने का प्रयास करें!"
                : "Sorry, I don't have any more product suggestions right now.\nTry asking about a different product or category!",
            intent: 'alternative_request',
            confidence: 0.9,
            products: []
        };
    }

    // ── Stage 3: Greeting Detection ───────────────────────────────────────────
    const exactGreetings = ['hi', 'hello', 'hii', 'helo', 'hey', 'greetings', 'नमस्ते', 'नमस्कार', 'हेल्लो', 'हाय', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', 'ਹੈਲੋ'];
    const cleanLowerQuery = lowerQuery.replace(/[^a-z0-9\s\u0900-\u097F\u0A00-\u0A7F]/g, '').trim();
    if (exactGreetings.includes(lowerQuery) || exactGreetings.includes(cleanLowerQuery)) {
        return {
            answer: language === 'hi'
                ? "नमस्ते! मैं हाउस ऑफ उर्वाह कंसिएर्ज हूँ, आपका स्टाइल और फैशन सहायक। 🌿\nआज मैं आपकी कैसे मदद कर सकता हूँ? आप मुझसे इनके बारे में पूछ सकते हैं:\n• उत्पाद (जैसे \"कुर्ती\", \"साड़ी\")\n• आकार, मूल्य निर्धारण, शिपिंग, रिटर्न या कंपनी की जानकारी"
                : "Hello! I'm House of Urvaah Concierge, your fashion & style assistant. 🌿\nHow can I help you today? You can ask me about:\n• Products (e.g. \"Dresses\", \"Sarees\")\n• Sizes, pricing, shipping, returns, or company info",
            intent: 'greeting',
            confidence: 1.0,
            products: []
        };
    }

    // ── Stage 4: Price Filtering Detection ────────────────────────────────────
    const priceBetweenRegex = /(?:between|from)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(?:to|-|and)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)/i;
    const priceUnderRegex = /(?:under|below|less than|affordable|budget|within)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)/i;
    const priceAboveRegex = /(?:above|greater than|more than|higher than|from)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)/i;

    const betweenMatch = sanitizedQuery.match(priceBetweenRegex);
    const underMatch = sanitizedQuery.match(priceUnderRegex);
    const aboveMatch = sanitizedQuery.match(priceAboveRegex);

    if (betweenMatch) {
        const minPrice = parseFloat(betweenMatch[1]);
        const maxPrice = parseFloat(betweenMatch[2]);
        const priceProducts = await productService.chatbotSearchByPrice(maxPrice);
        const filtered = priceProducts.filter(p => p.price >= minPrice);
        if (filtered.length > 0) {
            let answer = language === 'hi' 
                ? `₹${minPrice} और ₹${maxPrice} के बीच के उत्पाद यहाँ दिए गए हैं:\n`
                : `Here are products between ₹${minPrice} and ₹${maxPrice}:\n`;
            filtered.slice(0, 5).forEach(p => { answer += `• ${p.name}: ₹${p.price}\n`; });
            if (filtered.length > 5) answer += language === 'hi' ? `...और ${filtered.length - 5} अधिक।` : `...and ${filtered.length - 5} more.`;
            setSession(sessionId, { lastProducts: filtered, lastKeyword: '', lastCategory: '' });
            return { answer: answer.trim(), intent: 'price_filter', confidence: 1.0, products: filtered };
        }
        return { 
            answer: language === 'hi' 
                ? `क्षमा करें, ₹${minPrice} और ₹${maxPrice} के बीच कोई उत्पाद उपलब्ध नहीं है।` 
                : `Sorry, no products available between ₹${minPrice} and ₹${maxPrice}.`, 
            intent: 'price_filter', 
            confidence: 1.0, 
            products: [] 
        };
    }

    if (underMatch) {
        const maxPrice = parseFloat(underMatch[1]);
        const priceProducts = await productService.chatbotSearchByPrice(maxPrice);
        if (priceProducts.length > 0) {
            let answer = language === 'hi'
                ? `₹${maxPrice} से कम के उत्पाद यहाँ दिए गए हैं:\n`
                : `Here are products under ₹${maxPrice}:\n`;
            priceProducts.slice(0, 5).forEach(p => { answer += `• ${p.name}: ₹${p.price}\n`; });
            if (priceProducts.length > 5) answer += language === 'hi' ? `...और ${priceProducts.length - 5} अधिक।` : `...and ${priceProducts.length - 5} more.`;
            setSession(sessionId, { lastProducts: priceProducts, lastKeyword: '', lastCategory: '' });
            return { answer: answer.trim(), intent: 'price_filter', confidence: 1.0, products: priceProducts };
        }
        return { 
            answer: language === 'hi'
                ? `क्षमा करें, ₹${maxPrice} से कम कोई उत्पाद उपलब्ध नहीं है।`
                : language === 'pa'
                ? `ਮਾਫ਼ ਕਰਨਾ, ₹${maxPrice} ਤੋਂ ਘੱਟ ਕੋਈ ਉਤਪਾਦ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।`
                : `Sorry, no products available under ₹${maxPrice}.`, 
            intent: 'price_filter', 
            confidence: 1.0, 
            products: [] 
        };
    }

    if (aboveMatch) {
        const minPrice = parseFloat(aboveMatch[1]);
        const priceProducts = await productService.chatbotSearchByPriceAbove(minPrice);
        if (priceProducts.length > 0) {
            let answer = language === 'hi'
                ? `₹${minPrice} से ऊपर के उत्पाद यहाँ दिए गए हैं:\n`
                : `Here are products above ₹${minPrice}:\n`;
            priceProducts.slice(0, 5).forEach(p => { answer += `• ${p.name}: ₹${p.price}\n`; });
            if (priceProducts.length > 5) answer += language === 'hi' ? `...और ${priceProducts.length - 5} अधिक।` : `...and ${priceProducts.length - 5} more.`;
            setSession(sessionId, { lastProducts: priceProducts, lastKeyword: '', lastCategory: '' });
            return { answer: answer.trim(), intent: 'price_filter_above', confidence: 1.0, products: priceProducts };
        }
        return { 
            answer: language === 'hi'
                ? `क्षमा करें, ₹${minPrice} से ऊपर कोई उत्पाद उपलब्ध नहीं है।`
                : language === 'pa'
                ? `ਮਾਫ਼ ਕਰਨਾ, ₹${minPrice} ਤੋਂ ਉੱਪਰ ਕੋਈ ਉਤਪਾਦ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।`
                : `Sorry, no products available above ₹${minPrice}.`, 
            intent: 'price_filter_above', 
            confidence: 1.0, 
            products: [] 
        };
    }

    // ── Stage 4.5: Product Listing Intent ────────────────────────────────────
    const listingIntent = detectProductListingIntent(lowerQuery);
    if (listingIntent) {
        let listProducts = [];
        let listAnswer;

        if (listingIntent.isGeneral) {
            listProducts = await productService.chatbotGetProducts(10);
            listAnswer = listProducts.length > 0
                ? (language === 'hi' 
                    ? `यहाँ हमारे उपलब्ध उत्पाद हैं (${listProducts.length} दिखा रहे हैं)। विवरण देखने के लिए किसी पर भी क्लिक करें:` 
                    : language === 'pa'
                    ? `ਇੱਥੇ ਸਾਡੇ ਉਪਲਬਧ ਉਤਪਾਦ ਹਨ (${listProducts.length} ਦਿਖਾ ਰਹੇ ਹਨ)। ਵੇਰਵੇ ਦੇਖਣ ਲਈ ਕਿਸੇ 'ਤੇ ਵੀ ਕਲਿੱਕ ਕਰੋ:`
                    : `Here are our available products (${listProducts.length} shown). Click any to view details:`)
                : null;
        } else {
            listProducts = await productService.chatbotSearchByCategory(listingIntent.keyword, 10);
            if (listProducts.length === 0) {
                listProducts = await productService.simpleChatbotSearch(listingIntent.keyword);
            }
            listAnswer = listProducts.length > 0
                ? (language === 'hi'
                    ? `यहाँ ${listProducts.length} "${listingIntent.keyword}" उत्पाद हैं जो मुझे मिले। विवरण देखने के लिए किसी पर भी क्लिक करें:`
                    : language === 'pa'
                    ? `ਇੱਥੇ ${listProducts.length} "${listingIntent.keyword}" ਉਤਪਾਦ ਹਨ ਜੋ ਮੈਨੂੰ ਮਿਲੇ ਹਨ। ਵੇਰਵੇ ਦੇਖਣ ਲਈ ਕਿਸੇ 'ਤੇ ਵੀ ਕਲਿੱਕ ਕਰੋ:`
                    : `Here are ${listProducts.length} "${listingIntent.keyword}" product${listProducts.length > 1 ? 's' : ''} I found. Click any to view details:`)
                : null;
        }

        if (listProducts.length > 0) {
            setSession(sessionId, {
                lastProducts: listProducts,
                lastKeyword: listingIntent.keyword,
                lastCategory: listProducts[0]?.category || '',
            });
            return {
                answer: listAnswer,
                intent: 'product_listing',
                confidence: 1.0,
                products: listProducts,
            };
        }

        if (listingIntent.isGeneral) {
            await logUnansweredQuery(sanitizedQuery, 'product_listing');
            return {
                answer: language === 'hi' 
                    ? "क्षमा करें, हमारे पास अभी उत्पाद उपलब्ध नहीं हैं।" 
                    : language === 'pa'
                    ? "ਮਾਫ਼ ਕਰਨਾ, ਸਾਡੇ ਕੋਲ ਇਸ ਸਮੇਂ ਉਤਪਾਦ ਉਪਲਬਧ ਨਹੀਂ ਹਨ।"
                    : "Sorry, we don't have products available right now.",
                intent: 'product_listing',
                confidence: 1.0,
                products: [],
            };
        }
    }

    // ── Stage 5: Company / People Info Guard ──────────────────────────────────
    const companyInfoPatterns = [
        {
            pattern: /(who\s+(is|are|was)\s+(the\s+)?(owner|founder|ceo|director|co-founder)(\s+of\s+(this\s+company|urvaah|house\s+of\s+urvaah|your\s+company|the\s+brand))?|who\s+(started|runs|owns|founded)\s+(urvaah|house\s+of\s+urvaah|this\s+company|this\s+brand)|about\s+(urvaah|house\s+of\s+urvaah|your\s+company|your\s+brand)|who\s+created\s+(urvaah|house\s+of\s+urvaah)|कौन\s+है\s+(मालिक|संस्थापक)\s*(उर्वाह|कंपनी)?)/i,
            answer: language === 'hi'
                ? "हाउस ऑफ उर्वाह (House of Urvaah) एक विशेष लक्जरी फैशन लेबल है जिसे एक समर्पित टीम द्वारा सुरुचिपूर्ण, कालातीत परिधान लाने के लिए बनाया गया है।\n\nविशिष्ट नेतृत्व या पूछताछ के लिए, कृपया support@houseofurvaah.com पर संपर्क करें।"
                : "House of Urvaah is a luxury fashion label founded and curated by a dedicated design team committed to bringing timeless, architectural couture and contemporary silhouettes to life.\n\nFor specific leadership, press, or atelier inquiries, please visit our About page or contact us at support@houseofurvaah.com."
        },
        {
            pattern: /(\b(owner|founder|ceo|director|co-founder)\b.*\b(urvaah|house\s+of\s+urvaah|company|brand)\b|(मालिक|संस्थापक|प्रमुख).*(उर्वाह|कंपनी))/i,
            answer: language === 'hi'
                ? "हाउस ऑफ उर्वाह की स्थापना और प्रबंधन एक समर्पित डिजाइन टीम द्वारा किया जाता है।\n\nनेतृत्व के विवरण के लिए, कृपया हमारे 'हमारे बारे में' (About) पृष्ठ पर जाएं या support@houseofurvaah.com पर हमसे संपर्क करें।"
                : "House of Urvaah is founded and designed by a passionate creative atelier team.\n\nFor brand stories and leadership details, please visit our About page or contact us at support@houseofurvaah.com."
        },
        {
            pattern: /(about\s+(urvaah|house\s+of\s+urvaah|the\s+company|your\s+brand|your\s+company)|(उर्वाह|कंपनी|हमारे)\s+बारे\s+में)/i,
            answer: language === 'hi'
                ? "हाउस ऑफ उर्वाह के बारे में:\n\nमिशन: कालातीत, सुरुचिपूर्ण और प्रामाणिक शिल्प कौशल लाना।\nदृष्टि: भारतीय शिल्प और आधुनिक सिल्हूट के संगम के लिए सबसे भरोसेमंद लक्जरी फैशन मंच बनना।\n\nसंपर्क: support@houseofurvaah.com | +91 1800-123-4567"
                : "About House of Urvaah:\n\nMission: Celebrating modern femininity with architectural silhouettes, pure tissue silks, cora cottons, and handcrafted embroidery.\nVision: To be the premier destination for versatile day-to-evening luxury garments.\n\nContact us: support@houseofurvaah.com | +91 1800-123-4567"
        },
        {
            pattern: /(what\s+(is|are)\s+(urvaah|house\s+of\s+urvaah)|(उर्वाह)\s+क्या\s+है)/i,
            answer: language === 'hi'
                ? "हाउस ऑफ उर्वाह (House of Urvaah) एक प्रीमियम लक्जरी फैशन लेबल है जो प्रदान करता है:\n• 100% प्रामाणिक, उच्च-गुणवत्ता वाले परिधान\n• हाथ से कढ़ाई किए गए कोर्सेट और आधुनिक कुर्तियां\n• बहुमुखी दिन-से-शाम को-ऑर्ड सेट्स\n\nअधिक जानने के लिए हमारे 'About' पृष्ठ पर जाएं!"
                : "House of Urvaah is an exclusive Indian luxury fashion label offering:\n• 100% authentic, designer-crafted garments\n• Hand-embroidered raw silk corsets & cora cotton kurtis\n• Versatile day-to-evening couture & bloom sets\n\nExplore our catalog to discover the full collection!"
        },
    ];
    // ── Stage 5.5: Inventory Count Queries ─────────────────────────────────────
    const isHowMany = lowerQuery.includes('how many') || lowerQuery.includes('total') || lowerQuery.includes('list of all') || lowerQuery.includes('count') || lowerQuery.includes('कितने') || lowerQuery.includes('कुल');
    const mentionsProducts = lowerQuery.includes('product') || lowerQuery.includes('उत्पाद') || lowerQuery.includes('item') || lowerQuery.includes('dress') || lowerQuery.includes('clothes');
    const mentionsCategories = lowerQuery.includes('categor') || lowerQuery.includes('श्रेणी');

    if (isHowMany && mentionsProducts && !mentionsCategories) {
        try {
            const countRes = await pool.query('SELECT COUNT(*) FROM products WHERE COALESCE(is_active, true) = true');
            const total = countRes.rows[0].count;
            return {
                answer: language === 'hi'
                    ? `हाउस ऑफ उर्वाह संग्रह में वर्तमान में ${total} विशेष लक्जरी परिधान उपलब्ध हैं। आप कोर्सेट, ब्लूम सेट, या कुर्तियों के बारे में पूछ सकते हैं!`
                    : `We currently have ${total} exclusive luxury designer pieces available in the House of Urvaah atelier collection. You can search for specific silhouettes like corsets, bloom sets, or kurtis!`,
                intent: 'inventory_info',
                confidence: 1.0,
                products: []
            };
        } catch (e) { /* fall through */ }
    }

    if (isHowMany && mentionsCategories) {
        try {
            const countRes = await pool.query('SELECT COUNT(*) FROM category WHERE COALESCE(is_active, true) = true');
            const total = countRes.rows[0].count;
            return {
                answer: language === 'hi'
                    ? `हमारे पास फैशन शैलियों की श्रेणियां उपलब्ध हैं। आप किसी भी श्रेणी को देखने के लिए कह सकते हैं!`
                    : `We feature specialized fashion categories including Corsets, Bloom Sets, Co-Ords, and Kurtis. Which collection would you like to explore?`,
                intent: 'inventory_info',
                confidence: 1.0,
                products: []
            };
        } catch (e) { /* fall through */ }
    }

    for (const item of companyInfoPatterns) {
        if (item.pattern.test(sanitizedQuery)) {
            return {
                answer: item.answer,
                intent: 'about_info',
                confidence: 1.0,
                products: []
            };
        }
    }

    // ── Stage 6: Navigation & Static Intents (Regex) ─────────────────────────
    const navigationQueries = [
        {
            pattern: /privacy\s*policy/i,
            answer: language === 'hi'
                ? "गोपनीयता नीति (Privacy Policy):\n\nहाउस ऑफ उर्वाह आपकी गोपनीयता की रक्षा के लिए प्रतिबद्ध है। हम आपकी व्यक्तिगत जानकारी (जैसे नाम, ईमेल और पता) केवल आपके आदेशों को संसाधित करने और आपके खरीदारी अनुभव को बेहतर बनाने के लिए एकत्र और उपयोग करते हैं। हम विपणन उद्देश्यों के लिए तीसरे पक्ष के साथ आपका डेटा नहीं बेचते या साझा नहीं करते हैं। सभी लेनदेन उद्योग-मानक एन्क्रिप्शन के साथ सुरक्षित हैं।"
                : "Privacy Policy:\n\nHouse of Urvaah is committed to protecting your privacy. We collect and use your personal information (such as name, email, and address) solely to process your orders and improve your shopping experience. We do not sell or share your data with third parties for marketing purposes. All transactions are secured with industry-standard encryption.",
            intent: 'navigation'
        },
        {
            pattern: /\b(return\s*policy|refund\s*policy|returns?|refunds?|exchange\s*policy|exchange)\b/i,
            answer: language === 'hi'
                ? "वापसी और धनवापसी नीति (Return & Refund Policy):\n\nहम चाहते हैं कि आप अपनी खरीदारी से पूरी तरह संतुष्ट हों। यदि आप किसी उत्पाद से खुश नहीं हैं, तो आप उसे डिलीवरी के 7 दिनों के भीतर वापस या बदल (exchange) सकते हैं। वस्तु अप्रयुक्त (unused), अपनी मूल पैकेजिंग में और सभी ब्रांड टैगों के साथ होनी चाहिए। 5-7 व्यावसायिक दिनों के भीतर आपके मूल भुगतान माध्यम में पूर्ण धनवापसी संसाधित की जाएगी।"
                : "Return & Refund Policy:\n• 7-day hassle-free return and exchange window from delivery.\n• Items must be unwashed, unworn, and in original luxury packaging with all tags intact.\n• Contact support@houseofurvaah.com or call +91 1800-123-4567 to initiate an easy pickup.\n• Full refund will be processed back to your original payment method within 5-7 business days.",
            intent: 'navigation'
        },
        {
            pattern: /\b(login|sign\s*in|how\s*to\s*login|sign\s*up|register|account)\b/i,
            answer: language === 'hi'
                ? "हाउस ऑफ उर्वाह में लॉगिन / अकाउंट:\n1. हाउस ऑफ उर्वाह वेबसाइट पर जाएं।\n2. ऊपर दाईं ओर 'अकाउंट' (Account) आइकन पर क्लिक करें।\n3. अपना पंजीकृत ईमेल और पासवर्ड दर्ज करें।\n4. नए ग्राहक 'साइन अप' (Sign Up) करके नया खाता बना सकते हैं।"
                : "To access your House of Urvaah Account:\n1. Click the 'Account' icon in the top header navigation.\n2. Enter your registered email address and password to log in.\n3. New clients can select 'Sign Up' to create an account for faster checkout and order tracking.\n4. Use 'Forgot Password' if you need a quick reset link.",
            intent: 'navigation'
        },
        {
            pattern: /\b(how\s*(to\s*)?order|place\s*(an?\s*)?order|ordering|how\s*to\s*buy)\b/i,
            answer: language === 'hi'
                ? "ऑर्डर करना आसान है! 🛒\n1. हमारे संग्रह को ब्राउज़ करें\n2. अपने पसंदीदा परिधान पर 'Add to Cart' पर क्लिक करें\n3. कार्ट खोलें और 'Checkout' पर क्लिक करें\n4. शिपिंग पता दर्ज करें और Razorpay के माध्यम से सुरक्षित भुगतान करें।"
                : "Ordering with House of Urvaah is seamless! 🛒\n1. Browse our collections and select your preferred size (XS to XL).\n2. Click 'Add to Bag' / 'Add to Cart'.\n3. Proceed to Checkout and enter your shipping address.\n4. Complete payment securely via Razorpay (UPI, Cards, Net Banking).\n5. You will receive an instant order confirmation via email and WhatsApp!",
            intent: 'navigation'
        },
        {
            pattern: /\b(shipping|delivery|delivery\s*charges|courier|dispatch)\b|how\s*long\s*(does\s*it\s*take|to\s*deliver)/i,
            answer: language === 'hi'
                ? "शिपिंग और डिलीवरी जानकारी:\n• ₹2,999 से अधिक के सभी ऑर्डर पर पूरे भारत में मुफ़्त डिलीवरी (FREE Delivery)\n• मानक डिलीवरी 3-5 व्यावसायिक दिनों में पूरी होती है\n• डिस्पैच के बाद रीयल-टाइम ट्रैकिंग उपलब्ध रहती है"
                : "Shipping & Delivery Information:\n• Complimentary FREE delivery across India on orders above ₹2,999.\n• Standard nationwide delivery takes 3 to 5 business days.\n• Orders are dispatched within 24–48 hours in signature luxury garment boxes.\n• Real-time tracking link is sent via SMS, WhatsApp, and email upon dispatch.",
            intent: 'navigation'
        },
        {
            pattern: /\b(contact|support|email|phone|call\s*us|customer\s*care|helpline)\b/i,
            answer: language === 'hi'
                ? "हमसे संपर्क करें:\n📧 ईमेल: support@houseofurvaah.com\n📞 फोन: +91 1800-123-4567\n⏰ समय: सोमवार से शनिवार, सुबह 9:00 बजे से शाम 6:00 बजे तक\n\nहमारी कंसीयर्ज टीम सहायता के लिए सदैव तत्पर है!"
                : "House of Urvaah Concierge Support:\n📧 Email: support@houseofurvaah.com\n📞 Phone: +91 1800-123-4567\n⏰ Hours: Monday – Saturday, 9:00 AM – 6:00 PM IST\n\nOur client service team typically responds within 24 business hours!",
            intent: 'contact_info'
        },
        {
            pattern: /\b(payment|payment\s*methods?|how\s*to\s*pay|pay\s*online|cod|cash\s*on\s*delivery|upi|razorpay|net\s*banking)\b/i,
            answer: language === 'hi'
                ? "स्वीकार किए गए भुगतान विकल्प:\n• UPI (Google Pay, PhonePe, Paytm, BHIM)\n• क्रेडिट एवं डेबिट कार्ड (Visa, Mastercard, RuPay, Amex)\n• नेट बैंकिंग\n• सभी लेनदेन 256-बिट SSL एन्क्रिप्शन के साथ Razorpay द्वारा 100% सुरक्षित हैं।"
                : "Payment Methods Accepted:\n• UPI (Google Pay, PhonePe, Paytm, BHIM)\n• All major Credit & Debit Cards (Visa, Mastercard, RuPay, Amex)\n• Net Banking across 50+ banks\n• Digital Wallets\n\nAll transactions are 100% secure, processed via Razorpay with banking-grade 256-bit encryption.",
            intent: 'navigation'
        },
        {
            pattern: /(discount|coupon|promo\s*code|voucher|offers?|sale|deal|छूट|ऑफ़र)/i,
            answer: language === 'hi'
                ? "ऑफ़र और विशेषाधिकार:\n• ₹2,999 से अधिक के सभी ऑर्डर पर निःशुल्क शिपिंग।\n• पहले निजी संग्रह पूर्वावलोकन और मौसमी प्रचार प्राप्त करने के लिए हमारे न्यूज़लेटर की सदस्यता लें।\n• आगामी त्यौहारों के लिए हमारे होमपेज पर नज़र रखें!"
                : "Exclusive Privileges & Offers:\n• Complimentary shipping nationwide on all orders above ₹2,999.\n• Subscribe to the House of Urvaah newsletter for private trunk show access and seasonal preview codes.\n• Check our website homepage for ongoing festive collections!",
            intent: 'offers_info'
        },
        {
            pattern: /(cancel\s*order|order\s*cancellation|how\s*to\s*cancel|can\s*i\s*cancel)/i,
            answer: language === 'hi'
                ? "ऑर्डर रद्द करना:\n• आप ऑर्डर देने के 12 घंटों के भीतर support@houseofurvaah.com या +91 1800-123-4567 पर संपर्क करके रद्द कर सकते हैं।\n• डिस्पैच के बाद, आप 7-दिवसीय आसान वापसी नीति का लाभ ले सकते हैं।"
                : "Order Cancellation:\n• Orders can be cancelled within 12 hours of placement before entering our atelier dispatch process.\n• Email support@houseofurvaah.com or call +91 1800-123-4567 with your Order ID.\n• If already shipped, you can simply utilize our 7-day hassle-free return upon delivery.",
            intent: 'cancellation_info'
        },
        {
            pattern: /(store\s*location|physical\s*store|offline\s*store|where\s*(is|are)\s*(your\s*store|you\s*located)|address\s*of\s*(urvaah|store))/i,
            answer: language === 'hi'
                ? "स्टोर की जानकारी:\n• हाउस ऑफ उर्वाह एक विशेष डिजाइनर बुटीक है जो houseofurvaah.com के माध्यम से संचालित होता है और पूरे भारत में सुरक्षित डिलीवरी करता है।\n• निजी कंसीयर्ज पूछताछ के लिए, support@houseofurvaah.com पर संपर्क करें।"
                : "Store & Atelier Information:\n• House of Urvaah operates exclusively via our official online flagship boutique (houseofurvaah.com), delivering nationwide with premium express couriers.\n• For bespoke styling appointments, bridal consultations, or press inquiries, please write to us at support@houseofurvaah.com or call +91 1800-123-4567.",
            intent: 'store_location'
        },
        {
            pattern: /(size\s*chart|sizing|size\s*guide|fit\s*guide|what\s*size|measurements?)/i,
            answer: language === 'hi'
                ? "आकार और फिटिंग गाइड (Size Guide):\n• हमारे उत्पाद XS, S, M, L, XL आकारों में उपलब्ध हैं।\n• हमारे कई विशेष टॉप्स और कोर्सेट में एडजस्टेबल लेस-अप बैक दिया गया है ताकि आपको सही और आरामदायक फिटिंग मिले।\n• प्रत्येक उत्पाद पृष्ठ पर विस्तृत साइज चार्ट उपलब्ध है।"
                : "Size & Fit Guide:\n• Standard sizing: XS, S, M, L, XL\n• Many of our signature tops and corsets feature adjustable lace-up backs for a custom, tailored silhouette.\n• Detailed bust, waist, and hip measurements are available on each product page under 'Size Guide'.\n• If you are between sizes, we recommend sizing up for structured pieces or contacting our concierge for bespoke sizing advice!",
            intent: 'size_guide'
        },
        {
            pattern: /(track\s*order|order\s*status|where\s*(is|are)\s*my\s*order|track\s*my\s*(package|item))/i,
            answer: language === 'hi'
                ? "ऑर्डर ट्रैकिंग:\n• आप 'अकाउंट' (Account) -> 'ऑर्डर्स' (Orders) में जाकर अपना ऑर्डर ट्रैक कर सकते हैं।\n• डिस्पैच होने के बाद ट्रैकिंग लिंक आपके ईमेल और व्हाट्सएप पर भी भेजा जाता है।"
                : "Track Your Order:\n• Go to 'My Account' -> 'Orders' to view real-time tracking.\n• A tracking link is also sent to your registered email and WhatsApp once your order is dispatched.\n• Standard dispatch takes place within 24–48 hours.",
            intent: 'order_tracking'
        },
        {
            pattern: /(fabric|material|care\s*instructions?|wash\s*care|dry\s*clean)/i,
            answer: language === 'hi'
                ? "कपड़ा और देखभाल निर्देश:\n• हम शुद्ध कच्चा टिशू सिल्क, सांस लेने योग्य कोरा कॉटन और सुनहरी ज़री कढ़ाई का उपयोग करते हैं।\n• जटिल कढ़ाई वाले सिल्क और कोर्सेट टुकड़ों के लिए केवल ड्राई क्लीन की सिफारिश की जाती है।"
                : "Fabrics & Care Guidance:\n• We use pure raw tissue silk, breathable cora cotton, and handcrafted golden zari embroidery.\n• Dry clean is strongly recommended for all embroidered silk and structured corset pieces to preserve the delicate handwork.\n• Cora cotton pieces can be gently hand-washed in cold water.",
            intent: 'fabric_care'
        },
    ];

    for (const nav of navigationQueries) {
        if (nav.pattern.test(sanitizedQuery)) {
            return {
                answer: nav.answer,
                intent: nav.intent,
                confidence: 1.0,
                products: []
            };
        }
    }

    // ── Stage 7: Knowledge-Base Lookup (DB regex, word-boundary aware) ────────
    // Create a "shadow query" by normalizing keywords to English for matching against English patterns
    const shadowQuery = tokens.map(t => normalizeKeyword(t)).join(' ');
    
    // We try to match the original query OR the normalized shadow query
    const knowledgeSql = `
        SELECT * FROM chatbot_knowledge 
        WHERE is_approved = true AND (
            $1 ~* ('\\y(' || query_pattern || ')\\y') OR
            $2 ~* ('\\y(' || query_pattern || ')\\y')
        )
        ORDER BY confidence_score DESC
        LIMIT 1
    `;
    try {
        const knowledgeResult = await pool.query(knowledgeSql, [sanitizedQuery, shadowQuery]);

        if (knowledgeResult.rows.length > 0) {
            const entry = knowledgeResult.rows[0];

            // If we are in Hindi/Punjabi mode, we should ideally translate the answer
            // but for now we will provide a localized prefix if it's a known product category
            let answer = entry.answer;
            
            // Simple translation for common health topics in knowledge base
            if (language === 'hi' || language === 'pa') {
                answer = localizeText(answer, language);
            }

            // Increment usage count asynchronously
            pool.query(
                'UPDATE chatbot_knowledge SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1',
                [entry.id]
            ).catch(() => { });

            let products = [];
            // Use the provided keyword from DB, or extract from query if it's long enough.
            const keyword = entry.keywords && entry.keywords.length > 0
                ? entry.keywords[0]
                : (sanitizedQuery.length >= 3 ? sanitizedQuery : null);

            // Fetch products if there is any meaningful keyword associated with the knowledge base entry.
            // This ensures questions about "immunity" will suggest immunity products alongside the helpful answer.
            if (keyword) {
                products = await productService.simpleChatbotSearch(keyword);

                // If the direct keyword failed, but this was a product intent, try again with the sanitized query
                if (products.length === 0 && (entry.intent === 'product_info' || entry.intent === 'product_search')) {
                    products = await productService.simpleChatbotSearch(sanitizedQuery);
                }

                if (products.length > 0) {
                    setSession(sessionId, {
                        lastProducts: products,
                        lastKeyword: keyword,
                        lastCategory: products[0]?.category || ''
                    });
                }
            }

            return {
                answer: answer,
                intent: entry.intent,
                confidence: parseFloat(entry.confidence_score),
                products
            };
        }
    } catch (err) {
        if (err.code !== '42P01') {
            console.error('Knowledge-base lookup error:', err.message);
        }
    }

    // ── Stages 8–10: Product Search (only if likely a product query) ──────────
    const productSearchAllowed = isLikelyProductQuery(lowerQuery, tokens);

    if (productSearchAllowed) {
        // Stage 8: Direct product search (ILIKE on full query)
        let directProducts = await productService.simpleChatbotSearch(sanitizedQuery);
        
        // If Hindi/Punjabi, try searching with shadow query too
        if (directProducts.length === 0 && shadowQuery && shadowQuery !== sanitizedQuery) {
            directProducts = await productService.simpleChatbotSearch(shadowQuery);
        }

        if (directProducts.length > 0) {
            setSession(sessionId, {
                lastProducts: directProducts,
                lastKeyword: shadowQuery || sanitizedQuery,
                lastCategory: directProducts[0]?.category || ''
            });
            return {
                answer: language === 'hi'
                    ? `मुझे "${localizeText(shadowQuery || sanitizedQuery, 'hi')}" से मेल खाने वाले ${directProducts.length} उत्पाद मिले:`
                    : language === 'pa'
                    ? `ਮੈਨੂੰ "${localizeText(shadowQuery || sanitizedQuery, 'pa')}" ਨਾਲ ਮੇਲ ਖਾਂਦੇ ${directProducts.length} ਉਤਪਾਦ ਮਿਲੇ ਹਨ:`
                    : `I found ${directProducts.length} product${directProducts.length > 1 ? 's' : ''} matching "${sanitizedQuery}":`,
                intent: 'product_search',
                confidence: 1.0,
                products: directProducts
            };
        }

        // Stage 9: Keyword-level product search
        if (keywords.length > 0) {
            for (const rawKw of keywords) {
                const kw = normalizeKeyword(rawKw);
                const kwProducts = await productService.simpleChatbotSearch(kw);
                if (kwProducts.length > 0) {
                    setSession(sessionId, {
                        lastProducts: kwProducts,
                        lastKeyword: kw,
                        lastCategory: kwProducts[0]?.category || ''
                    });
                    return {
                        answer: language === 'hi'
                            ? `यहाँ "${rawKw}" (${localizeText(kw, 'hi')}) से संबंधित उत्पाद दिए गए हैं:`
                            : language === 'pa'
                            ? `ਇੱਥੇ "${rawKw}" (${localizeText(kw, 'pa')}) ਨਾਲ ਸਬੰਧਤ ਉਤਪਾਦ ਹਨ:`
                            : `Here are products related to "${rawKw}":`,
                        intent: 'product_search',
                        confidence: 0.85,
                        products: kwProducts
                    };
                }
            }
        }

        // Stage 10: Fuzzy product search — RAISED threshold to 0.45 to reduce false positives
        const fuzzySql = `
            SELECT product_id, title AS productname, word_similarity($1, title) AS score
            FROM products
            WHERE COALESCE(is_active, true) = true AND word_similarity($1, title) > 0.45
            ORDER BY score DESC
            LIMIT 1
        `;
        try {
            // Try fuzzy search with original query AND shadow query
            let fuzzyResult = await pool.query(fuzzySql, [sanitizedQuery]);
            if ((!fuzzyResult.rows.length || fuzzyResult.rows[0].score < 0.45) && shadowQuery && shadowQuery !== sanitizedQuery) {
                const shadowFuzzy = await pool.query(fuzzySql, [shadowQuery]);
                if (shadowFuzzy.rows.length > 0 && shadowFuzzy.rows[0].score > 0.45) {
                    fuzzyResult = shadowFuzzy;
                }
            }

            if (fuzzyResult.rows.length > 0 && fuzzyResult.rows[0].score > 0.45) {
                const suggestedName = fuzzyResult.rows[0].productname;
                const matchedProducts = await productService.simpleChatbotSearch(suggestedName);

                if (matchedProducts.length > 0) {
                    setSession(sessionId, {
                        lastProducts: matchedProducts,
                        lastKeyword: suggestedName,
                        lastCategory: matchedProducts[0]?.category || ''
                    });
                    return {
                        answer: language === 'hi'
                            ? `क्या आपका मतलब "${localizeText(suggestedName, 'hi')}" था? यहाँ मुझे जो मिला वह है:`
                            : language === 'pa'
                            ? `ਕੀ ਤੁਹਾਡਾ ਮਤਲਬ "${localizeText(suggestedName, 'pa')}" ਸੀ? ਇੱਥੇ ਮੈਨੂੰ ਜੋ ਮਿਲਿਆ ਉਹ ਹੈ:`
                            : `Did you mean "${suggestedName}"? Here's what I found:`,
                        intent: 'product_search_fuzzy',
                        confidence: parseFloat(fuzzyResult.rows[0].score),
                        products: matchedProducts,
                        suggestion: suggestedName
                    };
                }
            }
        } catch (err) {
            console.error('Fuzzy search error:', err.message);
        }
    }

    // ── Stage 11: Groq LLM Fashion Concierge (3-key fallback switch, website-only scope) ─────
    try {
        console.log(`🤖 Invoking Groq LLM Concierge for query: "${sanitizedQuery}"...`);
        const sessionHistory = session?.history || [];
        const llmResult = await groqService.generateChatResponse(sanitizedQuery, sessionHistory, language);

        if (llmResult && llmResult.success && llmResult.answer) {
            // Find any relevant products mentioned in query
            let relatedProducts = [];
            try {
                relatedProducts = await productService.simpleChatbotSearch(sanitizedQuery, 5);
                if (relatedProducts.length === 0 && keywords && keywords.length > 0) {
                    relatedProducts = await productService.simpleChatbotSearch(keywords[0], 5);
                }
            } catch (e) {
                // ignore product search error
            }

            const updatedHistory = [
                ...sessionHistory,
                { sender: 'user', text: sanitizedQuery },
                { sender: 'bot', text: llmResult.answer }
            ].slice(-10);

            setSession(sessionId, {
                history: updatedHistory,
                lastProducts: relatedProducts.length > 0 ? relatedProducts : (session?.lastProducts || []),
                lastKeyword: keywords?.[0] || sanitizedQuery
            });

            return {
                answer: llmResult.answer,
                intent: 'llm_concierge',
                confidence: 1.0,
                products: relatedProducts,
                keyUsed: llmResult.keyUsed,
                model: llmResult.model
            };
        }
    } catch (llmErr) {
        console.error('❌ Groq LLM Stage 11 invocation failed:', llmErr.message);
    }

    // ── Graceful Fallback if LLM keys are exhausted ────────────
    await logUnansweredQuery(sanitizedQuery, detectedIntent);

    return {
        answer: language === 'hi'
            ? "मुझे क्षमा करें, लेकिन मैं केवल हाउस ऑफ उर्वाह के लक्जरी फैशन, उत्पादों, स्टाइलिंग और ऑर्डर्स में सहायता कर सकता हूँ।"
            : language === 'pa'
            ? "ਮੈਨੂੰ ਮਾਫ਼ ਕਰੋ, ਪਰ ਮੈਂ ਸਿਰਫ਼ ਹਾਊਸ ਆਫ਼ ਉਰਵਾਹ ਲਗਜ਼ਰੀ ਫੈਸ਼ਨ, ਉਤਪਾਦਾਂ, ਸਟਾਈਲਿੰਗ ਅਤੇ ਆਰਡਰਾਂ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ।"
            : "I am happy to assist you with House of Urvaah fashion collections, styling guidance, sizing, or order details. Feel free to ask about our corsets, bloom sets, or delivery policies!",
        intent: 'fallback',
        confidence: 0.0,
        products: []
    };
};

/**
 * Log queries that didn't get a specific match to a database table for review.
 */
async function logUnansweredQuery(query, intent) {
    try {
        const sql = `
            INSERT INTO unanswered_queries (query_text, detected_intent, created_at)
            VALUES ($1, $2, NOW())
        `;
        await pool.query(sql, [query, intent]);
    } catch (err) {
        // Silently fail if table doesn't exist or other DB error
        console.error('Log unanswered query error:', err.message);
    }
}

// ─── Smart Search Wrapper ───────────────────────────────────────────────────

/**
 * processSmartSearch
 * Uses the NLP pipeline but injects previous results array directly into 
 * the session context so that stateless API calls can still use 
 * conversational features like "show other options".
 */
exports.processSmartSearch = async (query, previousResults = []) => {
    if (!query) return { answer: null, intent: 'fallback', products: [] };

    const sessionId = `smartsearch_${Date.now()}_${Math.random()}`;

    // Try to resolve category from previous items to aid alternative requests
    let lastCategory = '';
    if (previousResults && previousResults.length > 0) {
        try {
            const firstId = previousResults[0];
            // ID might be passed as int or string, handles both
            const result = await pool.query(
                'SELECT c.name as category_name FROM products p LEFT JOIN category c ON p.category_id = c.category_id WHERE p.product_id = $1',
                [firstId]
            );
            if (result.rows.length > 0) {
                lastCategory = result.rows[0].category_name || '';
            }
        } catch (e) { }
    }

    // Seed temporary session
    setSession(sessionId, {
        lastProducts: previousResults.map(id => ({ id: id.toString() })),
        lastKeyword: '',
        lastCategory: lastCategory
    });

    const result = await exports.processQuery(query, sessionId);

    // Clean up immediately for statelessness
    sessionStore.delete(sessionId);

    return result;
};

// ─── Query Logger ──────────────────────────────────────────────────────────────

exports.logQuery = async (data) => {
    const { userQuery, matchedPattern, intent, response, confidence, wasSuccessful, sessionId } = data;
    try {
        const sql = `
            INSERT INTO chatbot_query_logs 
            (user_query, matched_pattern, intent, response, confidence_score, was_successful, session_id, needs_review)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        const needsReview = !wasSuccessful || confidence < 0.5;
        await pool.query(sql, [
            userQuery, matchedPattern, intent, response,
            confidence, wasSuccessful, sessionId, needsReview
        ]);
    } catch (err) {
        console.error('Query logging error:', err.message);
    }
};

// ─── Exports for testing ───────────────────────────────────────────────────────
exports.logProductClick = logProductClick;
exports.localizeText = localizeText;
exports._nlpHelpers = {
    tokenize,
    extractKeywords,
    detectIntentFromTokens,
    isLikelyProductQuery,
    isAlternativeRequest,
    localizeText,
};
