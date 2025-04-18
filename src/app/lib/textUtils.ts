
/**
 * Text utility functions for the application
 */

/**
 * Capitalizes the first letter of a string
 * @param text - The text to capitalize
 * @returns The text with first letter capitalized
 */
export function capitalizeFirstLetter(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  return text.charAt(0).toUpperCase() + text.slice(1);
}
