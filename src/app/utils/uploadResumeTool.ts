import { Tool } from "@/app/types";
import { parseResumeFile, FileData } from "./parseResumeFile";

interface UploadResumeArgs {
  file: FileData;
}

export const uploadResumeTool: Tool = {
  type: "function",
  name: "uploadResume",
  description: "Parses an uploaded resume file and stores its text as 'resume_text' in context, then transfers to responseAgent.",
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "object",
        description: "The resume file data.",
        properties: {
          name: { type: "string", description: "The name of the file." },
          type: { type: "string", description: "The MIME type of the file." },
          data: { type: "string", description: "The Base64 encoded data URL of the file." }
        },
        required: ["name", "type", "data"]
      }
    },
    required: ["file"]
  },
  async run({ file }: UploadResumeArgs, context: any) {
    console.log("⏺️ uploadResume start");
    console.log("File:", file.name, file.type, `${file.data.length} chars`);
    try {
      const parsedText = await parseResumeFile(file);
      console.log("Parsed length:", parsedText.length);

      // Store under the key the responseAgent expects
      await context.set("resume_text", parsedText);
      console.log("Memory keys after set:", await context.getAllKeys());

      // Immediately transfer control to the responseAgent for Q&A
      try {
        await context.callFunction("transferAgents", {
          destination_agent: "responseAgent",
          rationale_for_transfer: "Resume uploaded and parsed",
          conversation_context: "Stored resume under 'resume_text'; ready for Q&A",
        });
        console.log("transferAgents call succeeded");
      } catch (handoffErr) {
        console.error("transferAgents failed:", handoffErr);
      }

      return "✅ Resume uploaded and saved to context.";
    } catch (err) {
      console.error("uploadResume run failed:", err);
      return `❌ Failed to upload resume: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
