// Follow this setup guide to integrate the Deno runtime into your application:
// https://deno.com/manual/getting_started/javascript

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminOrCron } from "../_shared/requireAdminOrCron.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    console.log("Request received:", req.method, req.url);

    const gate = await requireAdminOrCron(req);
    if (!gate.ok) {
      return new Response(JSON.stringify({ error: gate.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: gate.status,
      });
    }
    
    // Parse the JSON with error handling
    let body;
    try {
      body = await req.json();
    } catch (jsonError) {
      console.error("Error parsing JSON:", jsonError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }
    
    const { recipient, agencyName, weekStart, weekEnd, csvData, message, sender } = body;
    
    // Validate required fields
    if (!recipient || !agencyName || !weekStart || !weekEnd || !csvData) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Recipients must match an agency contact email (plain-text body already used below)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (supabaseUrl && serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: agencies } = await adminClient
        .from("agencies")
        .select("email, name");
      const allowed = new Set(
        (agencies || [])
          .map((a: { email?: string }) => (a.email || "").trim().toLowerCase())
          .filter(Boolean),
      );
      const recip = String(recipient).trim().toLowerCase();
      if (allowed.size > 0 && !allowed.has(recip)) {
        return new Response(
          JSON.stringify({ error: "Recipient is not an agency contact email" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }
    }
    
    console.log("Email request received for:", recipient);
    
    // Verify SMTP settings are available
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUsername = Deno.env.get("SMTP_USERNAME");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const emailFrom = Deno.env.get("EMAIL_FROM") || sender;
    
    if (!smtpHost || !smtpUsername || !smtpPassword) {
      console.error("SMTP configuration missing");
      return new Response(
        JSON.stringify({ error: "Server email configuration missing" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }
    
    console.log("Using SMTP config:", {
      host: smtpHost,
      port: smtpPort,
      username: smtpUsername ? "✓ set" : "✗ missing",
      password: smtpPassword ? "✓ set" : "✗ missing",
      from: emailFrom
    });
    
    try {
      // Configure SMTP client with newer library
      const client = new SMTPClient({
        connection: {
          hostname: smtpHost,
          port: Number(smtpPort) || 587,
          tls: true,
          auth: {
            username: smtpUsername,
            password: smtpPassword,
          },
        },
      });
      
      // Prepare email with attachment (plain text body only)
      const email = {
        from: emailFrom,
        to: recipient,
        subject: `Weekly Schedule: ${weekStart} - ${weekEnd}`,
        content: `Dear ${agencyName},\n\n${message || "Please find attached the weekly schedule."}`,
        attachments: [
          {
            filename: `rota_${weekStart}_${weekEnd}.csv`,
            content: csvData,
            encoding: "binary" as const,
            contentType: "text/csv",
          },
        ],
      };
      
      // Send email
      console.log("Sending email...");
      await client.send(email as Parameters<typeof client.send>[0]);
      console.log("Email sent successfully to:", recipient);
      
      // Close connection
      await client.close();
      
      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } catch (smtpError: unknown) {
      console.error("SMTP Error:", smtpError);
      const msg = smtpError instanceof Error ? smtpError.message : String(smtpError);
      return new Response(
        JSON.stringify({ error: `SMTP Error: ${msg}` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }
  } catch (error: unknown) {
    console.error("General error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${msg}` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}); 