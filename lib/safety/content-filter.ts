
export interface SafetyResult {
    safe: boolean;
    reasons: string[];
    score: number; // 0-1, where 1 is safest
}

export interface ContentFilterConfig {
    threshold?: number; // Default 0.5
    enableObfuscatedPII?: boolean; // Default true
    enableIntentAnalysis?: boolean; // Default true
}

// Enhanced PII patterns including obfuscated formats
const PII_PATTERNS = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    // Obfuscated email patterns:
    // "john dot smith at company dot org" or "john.smith [at] company [dot] org"
    emailObfuscated: /\b[A-Za-z0-9]+\s*(?:dot|\[dot\]|\(dot\)|\.)\s*[A-Za-z0-9]+\s*(?:at|\[at\]|\(at\)|@)\s*[A-Za-z0-9.-]+\s*(?:dot|\[dot\]|\(dot\)|\.)\s*[A-Za-z]{2,}\b/i,
    phone: /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/,
    creditCard: /\b(?:\d[ -]*?){13,19}\b/g,
};

/**
 * Luhn algorithm check for credit card validity
 */
function isLuhnValid(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i]);
        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
}

// Expanded harmful keywords
const HARMFUL_KEYWORDS = [
    'ignore previous instructions',
    'ignore all instructions',
    'ignore your instructions',
    'ignore the instructions',
    'disregard previous instructions',
    'disregard all instructions',
    'forget your instructions',
    'forget previous instructions',
    'system prompt',
    'you are now',
    'jailbreak',
    'bypass',
    'malicious',
    'exploit',
    'private key',
    'dump database',
    'delete all',
    'execute command',
    'root access',
    'admin panel',
    'phishing',
    'fraud',
    'extortion',
    'illegal activity',
    'drug production',
    'do not censor',
    'act as a different AI',
    'disregard safety guidelines',
    'reveal hidden information',
    'override security',
    'unrestricted mode',
    'developer mode',
    'full access',
    'give me the code for',
    'pretend you are',
    'act as if you are',
    'you are DAN',
    'in DAN mode',
];

// Intent analysis - patterns suggesting indirect malicious requests
const INDIRECT_INTENT_PATTERNS = [
    {
        pattern: /how (to|would|could|can).*(share|mention|drop|weave|integrate).*(email|phone|contact|address)/i,
        description: 'Indirect request for PII sharing techniques',
        risk: 0.6,
    },
    {
        pattern: /(subtle|natural|incidental).*(way|method).*(share|mention|provide).*(contact|email|information)/i,
        description: 'Request for subtle information sharing',
        risk: 0.5,
    },
    {
        pattern: /without.*(obvious|explicit|direct).*(email|contact|phone)/i,
        description: 'Request to hide PII sharing',
        risk: 0.5,
    },
];

export function checkContent(text: string, config?: ContentFilterConfig): SafetyResult {
    const reasons: string[] = [];
    let score = 1.0;

    if (!text) {
        return { safe: true, reasons: [], score: 1.0 };
    }

    const threshold = config?.threshold ?? 0.5;
    const enableObfuscated = config?.enableObfuscatedPII ?? true;
    const enableIntent = config?.enableIntentAnalysis ?? true;

    // Check for PII
    if (PII_PATTERNS.email.test(text)) {
        reasons.push('Potential email address detected');
        score -= 0.2;
    }

    // Check for obfuscated PII
    if (enableObfuscated && PII_PATTERNS.emailObfuscated.test(text)) {
        reasons.push('Potential obfuscated email format detected (dot/at notation)');
        score -= 0.6; // High risk - intentional obfuscation suggests malicious intent
    }

    if (PII_PATTERNS.phone.test(text)) {
        reasons.push('Potential phone number detected');
        score -= 0.2;
    }
    if (PII_PATTERNS.ssn.test(text)) {
        reasons.push('Potential SSN detected');
        score -= 0.5; // High risk
    }

    // Check for credit card with Luhn validation
    const ccMatches = text.match(PII_PATTERNS.creditCard) || [];
    let foundValidCC = false;
    for (const match of ccMatches) {
        if (isLuhnValid(match)) {
            foundValidCC = true;
            break;
        }
    }

    const hasCardContext = /\b(?:credit|debit|payment|card(?:\s+number)?)\b/i.test(text);
    if (foundValidCC || (ccMatches.length > 0 && hasCardContext)) {
        reasons.push('Potential credit card number detected');
        score -= 0.5;
    }

    // Check for harmful keywords / injection attempts
    const lowerText = text.toLowerCase();
    for (const keyword of HARMFUL_KEYWORDS) {
        if (lowerText.includes(keyword)) {
            reasons.push(`Potential prompt injection keyword detected: "${keyword}"`);
            score -= 0.3;
        }
    }

    // Intent analysis - detect indirect malicious requests
    if (enableIntent) {
        for (const intentPattern of INDIRECT_INTENT_PATTERNS) {
            if (intentPattern.pattern.test(text)) {
                reasons.push(intentPattern.description);
                score -= intentPattern.risk;
            }
        }
    }

    // Determine safety based on score and threshold
    const safe = score >= threshold;

    return {
        safe,
        reasons,
        score: Math.max(0, score),
    };
}
