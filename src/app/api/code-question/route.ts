import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { ComprehensiveCodeSchema } from '@/app/types'; // Import the schema

// Initialize OpenAI client (ensure OPENAI_API_KEY is set in your environment)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  console.log('[API /code-question] Received POST request');

  try {
    // 1. Parse the request body
    const body = await req.json();
    console.log('[API /code-question] Request body parsed:', body);

    // 2. Validate the input against the schema (basic check)
    const { question, image } = body as ComprehensiveCodeSchema;
    if (!question || !image || !image.startsWith('data:image/png;base64,')) {
      console.error('[API /code-question] Invalid input data:', body);
      return NextResponse.json({ error: 'Invalid input data. Question and base64 PNG image are required.' }, { status: 400 });
    }
    console.log('[API /code-question] Input data validated.');

    // 3. Construct the payload for OpenAI gpt-4o-mini
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: question },
          {
            type: 'image_url',
            image_url: {
              url: image, // Pass the base64 data URL directly
              detail: 'auto', // Or 'low'/'high' depending on needs
            },
          },
        ],
      },
    ];
    console.log('[API /code-question] OpenAI request payload constructed.');

    // 4. Make the API call to OpenAI
    console.log('[API /code-question] Sending request to OpenAI gpt-4o-mini...');
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use the specified model
      messages: messages,
      max_tokens: 1000, // Adjust as needed
    });
    console.log('[API /code-question] OpenAI response received.');

    // 5. Process and return the response
    const assistantResponse = chatCompletion.choices[0]?.message?.content;
    if (!assistantResponse) {
      console.error('[API /code-question] No response content from OpenAI.');
      throw new Error('No response content received from OpenAI.');
    }

    console.log('[API /code-question] Successfully processed request. Sending response.');
    return NextResponse.json({ response: assistantResponse });

  } catch (error) {
    console.error('[API /code-question] Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to process code question', details: errorMessage }, { status: 500 });
  }
}