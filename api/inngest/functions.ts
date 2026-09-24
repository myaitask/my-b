import { inngest } from "./client";

export const processWhatsAppMessage = inngest.createFunction(
  { id: "process-whatsapp-message" },
  { event: "whatsapp/message.received" },
  async ({ event, step }) => {
    const payload = event.data;

    // Step 1: Log the message
    await step.run("log-message", async () => {
      console.log("Processing incoming WhatsApp message:", payload);
      // Here you would query Supabase to find the tenant_id 
      // and insert the message into the 'messages' table.
      return { success: true };
    });

    // Step 2: Trigger AI response or automation
    await step.run("trigger-automation", async () => {
      // Find automation workflows for this tenant and execute them
      console.log("Triggering automations for the message...");
      return { triggered: true };
    });

    return { processed: true, payload };
  }
);
