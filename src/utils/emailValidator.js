const dns = require('dns').promises;

// Common misspelled domains mapped to their correct counterparts
const COMMON_DOMAIN_TYPOS = {
  // Gmail
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmaol.com': 'gmail.com',
  'gmaio.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.c': 'gmail.com',
  'gmai.co': 'gmail.com',
  'gmailc.om': 'gmail.com',
  'gamil.co': 'gmail.com',
  'gmaill.con': 'gmail.com',

  // Hotmail / Outlook
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotamail.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'hotmai.co': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outluk.com': 'outlook.com',
  'outlock.com': 'outlook.com',
  'outloook.com': 'outlook.com',

  // Yahoo
  'yahho.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yaho.co': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',

  // iCloud
  'iclud.com': 'icloud.com',
  'icoud.com': 'icloud.com',
  'icould.com': 'icloud.com',
  'icloud.con': 'icloud.com',

  // Rediffmail
  'redifmail.com': 'rediffmail.com',
  'rediff.com': 'rediffmail.com',
};

// Strict email regex matching valid standard emails
const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates an email address syntax, checks for common typos,
 * and verifies domain DNS MX records.
 */
async function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, message: 'Email address is required.' };
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Length check
  if (cleanEmail.length > 254) {
    return { isValid: false, message: 'Email address is too long.' };
  }

  // 2. Syntax check
  if (!STRICT_EMAIL_REGEX.test(cleanEmail)) {
    return { isValid: false, message: 'Please enter a valid email address (e.g. yourname@gmail.com).' };
  }

  const parts = cleanEmail.split('@');
  if (parts.length !== 2) {
    return { isValid: false, message: 'Please enter a valid email address.' };
  }

  const [localPart, domain] = parts;

  // Local part checks
  if (localPart.length > 64) {
    return { isValid: false, message: 'The username part of your email is too long.' };
  }
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return { isValid: false, message: 'Email address cannot start, end, or contain consecutive dots.' };
  }

  // Domain checks
  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) {
    return { isValid: false, message: 'The email domain ending is invalid. Please check your email.' };
  }

  // 3. Known domain typo check
  if (COMMON_DOMAIN_TYPOS[domain]) {
    const suggested = COMMON_DOMAIN_TYPOS[domain];
    return {
      isValid: false,
      message: `Did you mean @${suggested}? Please check your email for typos.`
    };
  }

  // 4. DNS MX record verification (with 2-second timeout protection)
  try {
    const mxLookup = dns.resolveMx(domain);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('DNS_TIMEOUT')), 2000));
    const mxRecords = await Promise.race([mxLookup, timeout]);

    if (!mxRecords || mxRecords.length === 0) {
      return {
        isValid: false,
        message: 'The email domain does not have active mail servers to receive emails. Please enter a valid email.'
      };
    }
  } catch (err) {
    if (err.code === 'ENOTFOUND') {
      return {
        isValid: false,
        message: 'The email domain does not exist. Please enter a valid email address.'
      };
    }
    if (err.code === 'ENODATA') {
      return {
        isValid: false,
        message: 'The email domain cannot receive incoming emails. Please enter a valid email address.'
      };
    }
    // If DNS_TIMEOUT or other network error, allow through so network hiccups do not block legitimate users
  }

  return { isValid: true, cleanEmail };
}

module.exports = {
  validateEmail,
  COMMON_DOMAIN_TYPOS,
  STRICT_EMAIL_REGEX
};
