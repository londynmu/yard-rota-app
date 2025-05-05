// Follow this setup guide to integrate the Deno runtime into your application:
// https://deno.com/manual/getting_started/javascript

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    // Log the request for debugging
    console.log("Request received:", req.method, req.url);
    
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
      
      // Prepare email with attachment
      const email = {
        from: emailFrom,
        to: recipient,
        subject: `Weekly Schedule: ${weekStart} - ${weekEnd}`,
        content: `Dear ${agencyName},\n\n${message || "Please find attached the weekly schedule."}`,
        html: `<p>Dear ${agencyName},</p><p>${(message || "Please find attached the weekly schedule.").replace(/\n/g, "<br>")}</p>`,
        attachments: [
          {
            filename: `rota_${weekStart}_${weekEnd}.csv`,
            content: csvData,
            contentType: "text/csv",
          },
        ],
      };
      
      // Send email
      console.log("Sending email...");
      await client.send(email);
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
    } catch (smtpError) {
      console.error("SMTP Error:", smtpError);
      return new Response(
        JSON.stringify({ error: `SMTP Error: ${smtpError.message}` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }
  } catch (error) {
    console.error("General error:", error);
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${error.message}` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}); 