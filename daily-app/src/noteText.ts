export const isPunctuationOnly = (text: string) => /^[\p{P}\s]+$/u.test(text.trim());
