// utils/parseResumeFile.ts

/**
 * Represents the file data structure sent from the client.
 */
export interface FileData {
  name: string;
  type: string;
  data: string; // Base64 Data URL (e.g., "data:text/plain;base64,...")
}

/**
 * Basic parser for resume files sent as Base64 Data URLs.
 * Attempts to decode Base64 and interpret as UTF-8 text.
 * NOTE: This is a very basic implementation and will not correctly
 * parse complex formats like PDF or DOCX. It's suitable for plain text.
 *
 * @param file The file data object containing name, type, and Base64 data URL.
 * @returns A promise that resolves with the extracted text or rejects on error.
 */
export async function parseResumeFile(file: FileData): Promise<string> {
  console.log(`Attempting to parse file: ${file.name} (${file.type})`);

  if (!file || typeof file.data !== 'string' || !file.data.startsWith('data:')) {
    console.error("Invalid file data provided:", file);
    throw new Error("Invalid file data format. Expected a Base64 Data URL.");
  }

  try {
    // Extract the Base64 part of the Data URL
    // Format: "data:[<mediatype>][;base64],<data>"
    const base64String = file.data.split(',')[1];
    if (!base64String) {
      throw new Error("Could not extract Base64 data from Data URL.");
    }

    // Decode Base64 string into a Buffer (assuming Node.js environment for server-side tool)
    const buffer = Buffer.from(base64String, 'base64');

    // Convert buffer to UTF-8 string
    const text = buffer.toString('utf-8');

    console.log(`Successfully parsed text from ${file.name}. Length: ${text.length}`);
    return text;

  } catch (error: any) {
    console.error(`Error parsing file ${file.name}:`, error);
    throw new Error(`Failed to parse file content: ${error.message}`);
  }
}