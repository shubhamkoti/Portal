const logger = require('../utils/logger');

/**
 * MASTER_SKILLS list for keyword-based extraction fallback.
 * Replicated from original aiService for independence.
 */
const MASTER_SKILLS = [
    'react', 'node', 'mongodb', 'express',
    'javascript', 'python', 'java',
    'docker', 'aws', 'sql', 'html', 'css',
    'machine learning', 'data science'
];

const DEFAULT_STRUCTURE = {
    name: "",
    email: "",
    phone: "",
    skills: [],
    education: [],
    projects: [],
    experience: [],
    confidence: 0
};

/**
 * Step 3 — Fallback Parsing (Deterministic)
 * Uses regex for email/phone and keyword matching for skills.
 * @param {string} text 
 * @returns {Object} Same schema with confidence 0.3
 */
function fallbackParse(text) {
    logger.info('[AI_RESUME_PARSER] Using deterministic fallback parsing');
    
    // Simple regex for email and phone
    const emailRegex = /[a-zA-Z0-9._%+-]+@ [a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/; // Space added to avoid matching prompt text? No, just standard.
    const standardEmailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g;

    const emails = text.match(standardEmailRegex) || [];
    const phones = text.match(phoneRegex) || [];
    
    // Skill keyword dictionary match
    const foundSkills = MASTER_SKILLS.filter(skill => 
        text.toLowerCase().includes(skill.toLowerCase())
    );

    return {
        ...DEFAULT_STRUCTURE,
        email: emails[0] || "",
        phone: phones[0] || "",
        skills: [...new Set(foundSkills)],
        confidence: 0.3
    };
}

/**
 * Step 2 — AI Semantic Parsing (Primary)
 * Calls local Ollama model (llama3)
 * @param {string} text 
 * @returns {Promise<Object|null>}
 */
async function aiParse(text) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const prompt = `
Extract resume information into a STRICT JSON schema.
Return ONLY JSON. No conversation. No markdown formatting.

Schema:
{
    "name": "Full Name",
    "email": "Email Address",
    "phone": "Phone Number",
    "skills": ["Skill1", "Skill2"],
    "education": ["Education details"],
    "projects": ["Project details"],
    "experience": ["Work experience details"],
    "confidence": 0.95
}

Rules:
1. If data missing, use "" or [].
2. Set "confidence" between 0.0 and 1.0.
3. Only extract technical and professional data.

Resume Text:
${text.substring(0, 5000)}
    `;

    try {
        logger.info('[AI_RESUME_PARSER] Attempting AI parsing with Ollama (llama3)...');
        
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3',
                prompt: prompt,
                stream: false,
                format: 'json'
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Ollama responded with status: ${response.status}`);
        }

        const data = await response.json();
        
        // Ollama returns generated text in 'response' field
        let parsedResult;
        try {
            parsedResult = typeof data.response === 'string' ? JSON.parse(data.response) : data.response;
        } catch (e) {
            logger.warn('[AI_RESUME_PARSER] Invalid JSON returned by AI model.');
            return null;
        }

        // Validate structure and confidence
        if (!parsedResult || typeof parsedResult !== 'object') return null;
        
        const confidence = parseFloat(parsedResult.confidence) || 0;
        if (confidence < 0.6) {
            logger.warn(`[AI_RESUME_PARSER] AI Confidence below threshold: ${confidence}`);
            return null;
        }

        // Return normalized result
        return {
            name: parsedResult.name || "",
            email: parsedResult.email || "",
            phone: parsedResult.phone || "",
            skills: Array.isArray(parsedResult.skills) ? parsedResult.skills : [],
            education: Array.isArray(parsedResult.education) ? parsedResult.education : [],
            projects: Array.isArray(parsedResult.projects) ? parsedResult.projects : [],
            experience: Array.isArray(parsedResult.experience) ? parsedResult.experience : [],
            confidence: confidence
        };

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            logger.error('[AI_RESUME_PARSER] Ollama request timed out (> 6s)');
        } else {
            logger.error(`[AI_RESUME_PARSER] Ollama connection error: ${error.message}`);
        }
        return null; // Trigger fallback
    }
}

/**
 * Step 4 — Stability Wrapper
 * Orchestrates AI parsing with deterministic fallback.
 * NEVER crashes; always returns valid JSON.
 */
async function parseResume(text) {
    try {
        if (!text || text.trim().length < 20) {
            return { ...DEFAULT_STRUCTURE, confidence: 0 };
        }

        // Try AI first
        const aiResult = await aiParse(text);
        if (aiResult) {
            return aiResult;
        }

        // Fallback to regex
        return fallbackParse(text);
    } catch (error) {
        logger.error(`[AI_RESUME_PARSER] Critical Wrapper Error: ${error.message}`);
        return { ...DEFAULT_STRUCTURE, confidence: 0 };
    }
}

module.exports = {
    parseResume
};
