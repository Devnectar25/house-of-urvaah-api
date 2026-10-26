/**
 * Groq LLM Service for Urvaah Bot
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides AI conversational intelligence strictly scoped to the House of Urvaah
 * website, collections, styling, sizing, and policies.
 *
 * Implements a robust 3-key fallback switch mechanism:
 *  - Switch Case 0: GROQ_API_KEY_1 (Primary Key)
 *  - Switch Case 1: GROQ_API_KEY_2 (Secondary Key on 429 / limit / failure)
 *  - Switch Case 2: GROQ_API_KEY_3 (Tertiary Key fallback)
 */

const productService = require('./productService');

// In-memory key tracking for rate limits (cooldown in milliseconds)
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown
const keyCooldowns = { 0: 0, 1: 0, 2: 0 };

/**
 * Resolve API key for a given switch case index
 */
function getKeyForCase(caseIndex) {
    switch (caseIndex) {
        case 0:
            return {
                name: 'Key 1 (GROQ_API_KEY_1)',
                key: process.env.GROQ_API_KEY_1 || ''
            };
        case 1:
            return {
                name: 'Key 2 (GROQ_API_KEY_2)',
                key: process.env.GROQ_API_KEY_2 || ''
            };
        case 2:
            return {
                name: 'Key 3 (GROQ_API_KEY_3)',
                key: process.env.GROQ_API_KEY_3 || process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY_1 || ''
            };
        default:
            return {
                name: 'Default Key',
                key: process.env.GROQ_API_KEY_1 || ''
            };
    }
}

/**
 * Build dynamic system prompt with live catalog and strict website-only boundaries
 */
async function buildSystemPrompt(language = 'en') {
    let liveProducts = [];
    try {
        liveProducts = await productService.chatbotGetProducts(15);
    } catch (e) {
        // Fallback to empty if DB query fails
    }

    const productCatalogSummary = liveProducts.map(p => (
        `• ${p.name || p.title}: ₹${p.price} | Category: ${p.category || 'Clothing'} | Status: ${p.inStock ? 'In Stock' : 'Limited'} | Highlights: ${(p.shortDescription || p.description || '').slice(0, 140)}`
    )).join('\n');

    return `You are Urvaah bot, the exclusive AI Luxury Customer Care for the official House of Urvaah website (houseofurvaah.com).

BRAND ESSENCE:
House of Urvaah is an ultra-premium Indian luxury fashion label known for runway-inspired architectural tailoring, hand-embroidered raw tissue silk corsets, pure cora cottons, delicate sequin work, potli button detailing, and versatile co-ord sets designed to transition seamlessly from day to evening.

LIVE HOUSE OF URVAAH CATALOG:
${productCatalogSummary || 'Sage Bloom Embroidered Corset (₹12,990), Ivory Heart Corset Kurti/Dress (₹8,990), Blush Pink Embroidered Floral Co-Ord Set (₹4,990), Mocha Brown Embroidered Co-Ord Set (₹4,990), Teal Embroidered Floral Co-Ord Set (₹6,490)'}

CORE POLICIES & ORDER GUIDANCE:
• Shipping: Free shipping across India on orders above ₹2,999. Standard delivery takes 3 to 5 business days. Express delivery available at checkout.
• Returns & Exchanges: 7-day hassle-free exchange or return policy for unused, unwashed garments with intact brand tags.
• Fit & Sizing: Standard Indian/International sizing (XS, S, M, L, XL). Most statement tops and corsets feature adjustable lace-up back closures for a bespoke, tailored silhouette.
• Styling Advice: Highlight the versatility of our pieces—e.g., drape the Sage Bloom Embroidered Corset over a sheer saree or silk lehenga, pair with tailored palazzos for formal evenings, or wear open/buttoned Ivory Heart Corset Kurti/Dress over denim.
• Payment Options: Secure online checkout via Razorpay (UPI, Credit/Debit cards, Net Banking).

STRICT SCOPE & BOUNDARY RULES (CRITICAL):
1. YOU MUST ONLY ANSWER QUESTIONS RELATED TO THE HOUSE OF URVAAH WEBSITE, OUR CLOTHING, PRODUCTS, STYLING ADVICE FOR OUR PIECES, FABRICS, SIZING, ORDERS, SHIPPING, AND POLICIES.
2. If the user asks about ANYTHING outside of House of Urvaah and its fashion pieces (for example: coding, general science, math, world politics, recipes, other brands, homework, trivia, etc.), YOU MUST POLITELY AND FIRMLY DECLINE.
   Example refusal: "I specialize exclusively in House of Urvaah luxury fashion and our store collections. I'm happy to assist you with our designs, styling, sizing, or order details! Would you like to explore our corsets or bloom sets?"
3. NEVER make up products that do not exist. Only reference pieces from House of Urvaah.
4. Keep your responses polished, elegant, warm, and concise (under 3-4 short paragraphs or bullet points). Use formatting like bold text for product names.
5. Language: Respond in ${language === 'hi' ? 'Hindi' : language === 'pa' ? 'Punjabi' : 'English'}, maintaining a respectful, high-fashion customer care tone.`;
}

/**
 * Execute chat completion with 3-key fallback switch logic
 */
async function generateChatResponse(userQuery, conversationHistory = [], language = 'en') {
    const now = Date.now();
    const systemPrompt = await buildSystemPrompt(language);
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

    // Prepare message array
    const formattedHistory = (conversationHistory || []).slice(-6).map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
    }));

    const messages = [
        ...formattedHistory,
        { role: 'user', content: userQuery }
    ];

    let lastError = null;
    const maxAttempts = 3;

    // Switch case attempt across keys 0, 1, 2
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let keyConfig;

        // Switch case based on key index
        switch (attempt) {
            case 0:
                keyConfig = getKeyForCase(0);
                break;
            case 1:
                keyConfig = getKeyForCase(1);
                break;
            case 2:
                keyConfig = getKeyForCase(2);
                break;
            default:
                keyConfig = getKeyForCase(0);
                break;
        }

        const { name: keyName, key } = keyConfig;

        if (!key || key.trim() === '' || key.includes('your_key')) {
            console.log(`ℹ️ [Groq Switch] ${keyName} is not configured or empty, moving to next key...`);
            continue;
        }

        // Check if key is currently in rate limit cooldown
        if (keyCooldowns[attempt] && now < keyCooldowns[attempt]) {
            console.log(`⏳ [Groq Switch] ${keyName} is in cooldown for ${Math.round((keyCooldowns[attempt] - now) / 1000)}s, switching to next key...`);
            continue;
        }

        try {
            console.log(`🤖 [Groq Switch] Querying LLM via ${keyName} (Model: ${model})...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key.trim()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...messages
                    ],
                    temperature: 0.4,
                    max_tokens: 450
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Handle HTTP 429 Rate Limit
            if (response.status === 429) {
                console.warn(`⚠️ [Groq Switch] ${keyName} hit Rate Limit (HTTP 429). Triggering switch to next key...`);
                keyCooldowns[attempt] = now + RATE_LIMIT_COOLDOWN_MS;
                lastError = new Error(`${keyName} rate limit exceeded (HTTP 429)`);
                continue; // Switch to next key in loop
            }

            // Handle other HTTP errors (e.g. 401, 500)
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData?.error?.message || response.statusText;
                console.warn(`⚠️ [Groq Switch] ${keyName} returned error HTTP ${response.status}: ${errMsg}. Switching...`);
                lastError = new Error(errMsg);
                continue; // Switch to next key in loop
            }

            const data = await response.json();
            const answer = data?.choices?.[0]?.message?.content;

            if (answer && answer.trim().length > 0) {
                console.log(`✨ [Groq Switch] Successfully generated Urvaah bot response using ${keyName}`);
                return {
                    success: true,
                    answer: answer.trim(),
                    keyUsed: keyName,
                    model: data.model || model
                };
            }

            throw new Error('Groq returned empty response');
        } catch (err) {
            console.error(`❌ [Groq Switch] Error with ${keyName}:`, err.message);
            lastError = err;
            // Switch to next key in loop
        }
    }

    console.warn(`⚠️ [Groq Switch] All configured LLM keys were exhausted or failed:`, lastError?.message);
    return {
        success: false,
        error: lastError?.message || 'All LLM API keys exhausted'
    };
}

module.exports = {
    generateChatResponse,
    getKeyForCase
};
