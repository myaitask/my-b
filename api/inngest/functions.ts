import { inngest } from "./client";
import { supabase } from "../supabase";

export const processWhatsAppMessage = inngest.createFunction(
  { id: "process-whatsapp-message" },
  { event: "whatsapp/message.received" },
  async ({ event, step }) => {
    const payload = event.data.payload;

    if (!payload.entry || payload.entry.length === 0) {
      return { status: "no_entry" };
    }

    const entry = payload.entry[0];
    const changes = entry.changes;

    if (!changes || changes.length === 0) {
      return { status: "no_changes" };
    }

    const value = changes[0].value;
    const phoneNumberId = value.metadata?.phone_number_id;

    if (!phoneNumberId) {
      return { status: "missing_phone_number_id" };
    }

    // Step 1: Find the tenant associated with this phone number ID
    const tenantData = await step.run("get-tenant", async () => {
      const { data, error } = await supabase
        .from('whatsapp_configs')
        .select('tenant_id')
        .eq('phone_number_id', phoneNumberId)
        .single();
      
      if (error || !data) {
        throw new Error(`Tenant not found for phone_number_id: ${phoneNumberId}`);
      }
      return data;
    });

    const tenantId = tenantData.tenant_id;

    // Step 2: Extract contacts and messages
    const contacts = value.contacts || [];
    const messages = value.messages || [];

    if (messages.length === 0) {
      return { status: "no_messages_to_process" };
    }

    // Step 3: Process the first contact (if available) and upsert it
    let contactId: string | null = null;
    if (contacts.length > 0) {
      const contactInfo = contacts[0];
      const waId = contactInfo.wa_id;
      const name = contactInfo.profile?.name || waId;

      contactId = await step.run("upsert-contact", async () => {
        // Upsert logic based on phone_number and tenant_id
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('phone_number', waId)
          .single();

        if (existing) {
          // Update last interaction
          await supabase
            .from('contacts')
            .update({ name: name, last_interaction_at: new Date().toISOString() })
            .eq('id', existing.id);
          return existing.id;
        } else {
          // Insert new
          const { data, error } = await supabase
            .from('contacts')
            .insert({
              tenant_id: tenantId,
              phone_number: waId,
              name: name,
              last_interaction_at: new Date().toISOString()
            })
            .select('id')
            .single();

          if (error) throw error;
          return data.id;
        }
      });
    }

    // Step 4: Process and save the message
    const message = messages[0];
    const wamId = message.id;

    await step.run("save-message", async () => {
      const { error } = await supabase
        .from('messages')
        .insert({
          tenant_id: tenantId,
          contact_id: contactId,
          wam_id: wamId,
          direction: 'inbound',
          type: message.type,
          content: message, // Store the full message object as content
          payload: value, // Store the raw payload metadata
          status: 'received'
        });

      if (error) {
        // Handle unique constraint if it's a duplicate webhook delivery
        if (error.code !== '23505') { 
          throw error;
        }
      }
      return { success: true };
    });

    // Step 5: Trigger AI/Automation (Placeholder for now)
    await step.run("trigger-automation", async () => {
      console.log(`Triggering automations for message ${wamId} from tenant ${tenantId}`);
      return { triggered: true };
    });

    return { processed: true, messageId: wamId };
  }
);
