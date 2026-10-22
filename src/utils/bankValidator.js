/**
 * Bank Details Validator for Indian Banking Systems (IMPS / NEFT / RTGS)
 * 
 * Rules:
 * - Account Holder Name: 3-70 characters, letters, spaces, and periods only.
 * - IFSC Code: 11 characters, uppercase, alphanumeric, 5th character must be '0' (zero).
 *   Format: /^[A-Z]{4}0[A-Z0-9]{6}$/
 * - Account Number: 9-18 digits, numbers only.
 *   Format: /^\d{9,18}$/
 * - Confirm Account Number: Must match Account Number (if provided).
 */

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const HOLDER_NAME_REGEX = /^[a-zA-Z\s.]{3,70}$/;
const DIGITS_ONLY_REGEX = /^\d+$/;

/**
 * Validates bank details object
 * @param {Object} bankDetails - { holderName, ifscCode, accountNumber, confirmAccountNumber }
 * @param {Object} options - { required: boolean }
 * @returns {{ isValid: boolean, error?: string, sanitized?: { holderName: string, ifscCode: string, accountNumber: string } }}
 */
function validateBankDetails(bankDetails, options = {}) {
    const { required = false } = options;

    if (!bankDetails || typeof bankDetails !== 'object') {
        if (required) {
            return { isValid: false, error: 'Bank details are required for refund disbursement.' };
        }
        return { isValid: true, sanitized: null };
    }

    const rawHolder = bankDetails.holderName || bankDetails.refund_holder_name || '';
    const rawIfsc = bankDetails.ifscCode || bankDetails.refund_ifsc_code || '';
    const rawAccount = bankDetails.accountNumber || bankDetails.refund_bank_account || '';
    const rawConfirm = bankDetails.confirmAccountNumber || bankDetails.confirmAccount || '';

    const cleanHolder = String(rawHolder).trim();
    const cleanIfsc = String(rawIfsc).trim().toUpperCase();
    const cleanAccount = String(rawAccount).trim();
    const cleanConfirm = String(rawConfirm).trim();

    const hasAnyField = Boolean(cleanHolder || cleanIfsc || cleanAccount || cleanConfirm);

    if (!hasAnyField) {
        if (required) {
            return { isValid: false, error: 'Bank details are required for refund disbursement.' };
        }
        return { isValid: true, sanitized: null };
    }

    // 1. Account Holder Name
    if (!cleanHolder) {
        return { isValid: false, error: 'Please enter the Account Holder Name.' };
    }
    if (cleanHolder.length < 3) {
        return { isValid: false, error: 'Account Holder Name must be at least 3 characters long.' };
    }
    if (cleanHolder.length > 70) {
        return { isValid: false, error: 'Account Holder Name cannot exceed 70 characters.' };
    }
    if (!HOLDER_NAME_REGEX.test(cleanHolder)) {
        return { isValid: false, error: 'Account Holder Name must contain only letters, spaces, and periods.' };
    }

    // 2. Bank IFSC Code
    if (!cleanIfsc) {
        return { isValid: false, error: 'Please enter your Bank IFSC Code.' };
    }
    if (cleanIfsc.length !== 11) {
        return { 
            isValid: false, 
            error: `Bank IFSC Code must be exactly 11 characters (currently ${cleanIfsc.length} characters). Example: HDFC0008718.` 
        };
    }
    if (cleanIfsc[4] !== '0') {
        return { 
            isValid: false, 
            error: 'Invalid IFSC Code: The 5th character must be the digit 0 (zero), not the letter O.' 
        };
    }
    if (!IFSC_REGEX.test(cleanIfsc)) {
        return { 
            isValid: false, 
            error: 'Invalid Bank IFSC Code format. Must be 4 letters, followed by 0, followed by 6 alphanumeric characters (e.g. HDFC0008718).' 
        };
    }

    // 3. Bank Account Number
    if (!cleanAccount) {
        return { isValid: false, error: 'Please enter your Bank Account Number.' };
    }
    if (!DIGITS_ONLY_REGEX.test(cleanAccount)) {
        return { isValid: false, error: 'Bank Account Number must contain numbers only.' };
    }
    if (cleanAccount.length < 9 || cleanAccount.length > 18) {
        return { 
            isValid: false, 
            error: `Bank Account Number must be between 9 and 18 digits (currently ${cleanAccount.length} digits).` 
        };
    }

    // 4. Confirm Account Number (if provided)
    if (cleanConfirm && cleanAccount !== cleanConfirm) {
        return { isValid: false, error: 'Bank Account Numbers do not match. Please verify and re-enter.' };
    }

    return {
        isValid: true,
        sanitized: {
            holderName: cleanHolder,
            ifscCode: cleanIfsc,
            accountNumber: cleanAccount
        }
    };
}

module.exports = {
    validateBankDetails,
    IFSC_REGEX,
    HOLDER_NAME_REGEX,
    DIGITS_ONLY_REGEX
};
