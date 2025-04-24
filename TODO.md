# Project TODOs

- Investigate using the `name` field in the OpenAI Chat Completions API messages array (vs. the current combined string approach with prefixes) to differentiate between `user_audio` and `speaker_audio` transcripts within a single turn. Evaluate potential impact on model performance and adherence to conversational patterns (role choice, message alternation). See [OpenAI Chat API Docs](https://platform.openai.com/docs/api-reference/chat/create). 

- Implement RAG integration for providing AppUser background/resume details to the chat completion API. Get vector store ID/details from Harsha. 