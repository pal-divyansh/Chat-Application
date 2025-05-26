// Simple encryption/decryption for message security
// In a production app, you'd want to use more robust encryption libraries

const SECRET_KEY = "your-secret-encryption-key-here";

export function encrypt(text: string): string {
  try {
    // Simple Caesar cipher for demonstration
    // In production, use proper encryption like AES
    const shift = 3;
    return text
      .split('')
      .map(char => {
        if (char.match(/[a-z]/i)) {
          const code = char.charCodeAt(0);
          const base = code >= 65 && code <= 90 ? 65 : 97;
          return String.fromCharCode(((code - base + shift) % 26) + base);
        }
        return char;
      })
      .join('');
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Return original text if encryption fails
  }
}

export function decrypt(encryptedText: string): string {
  try {
    // Reverse Caesar cipher
    const shift = 3;
    return encryptedText
      .split('')
      .map(char => {
        if (char.match(/[a-z]/i)) {
          const code = char.charCodeAt(0);
          const base = code >= 65 && code <= 90 ? 65 : 97;
          return String.fromCharCode(((code - base - shift + 26) % 26) + base);
        }
        return char;
      })
      .join('');
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedText; // Return encrypted text if decryption fails
  }
}
