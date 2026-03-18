import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    // 1. Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        // 2. Parse request body
        const body = await req.json();
        const {
            firstName,
            lastName,
            email,
            company,
            businessRegistrationNumber,
            role,
        } = body;

        // Validate required fields
        if (!email) {
            return new Response(
                JSON.stringify({ error: "Missing required fields" }),
                {
                    status: 400,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                }
            );
        }

        // Initialize Supabase admin client
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error("Missing Supabase environment variables");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch contact emails from platform_settings
        const { data: settingsData, error: settingsError } = await supabase
            .from("platform_settings")
            .select("value")
            .eq("key", "new_user_email")
            .single();

        if (settingsError && settingsError.code !== 'PGRST116') {
            console.error("Error fetching settings:", settingsError);
            // Non-fatal, we'll just skip sending
            return new Response(
                JSON.stringify({ error: "Failed to fetch notification emails settings" }),
                {
                    status: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                }
            );
        }

        // If no emails configured, just succeed silently
        if (!settingsData || !settingsData.value) {
            console.log("No new_user_email settings configured, skipping notification.");
            return new Response(
                JSON.stringify({ success: true, message: "No notification emails configured" }),
                {
                    status: 200,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                }
            );
        }

        const contactEmailsRaw = settingsData.value;
        const contactEmails = contactEmailsRaw
            .split(",")
            .map((e: string) => e.trim())
            .filter((e: string) => e.length > 0);

        if (contactEmails.length === 0) {
            return new Response(
                JSON.stringify({ success: true, message: "No valid notification emails configured" }),
                {
                    status: 200,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                }
            );
        }

        // SMTP2GO credentials
        const smtp2goApiKey = Deno.env.get("SMTP2GO_API_KEY");
        if (!smtp2goApiKey) {
            throw new Error("Missing SMTP2GO_API_KEY");
        }

        const emailSubject = `New User Registration: ${firstName || 'User'} ${lastName || ''}`.trim();

        const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#3B82F6 0%,#2563EB 100%);padding:40px 40px 30px;text-align:center;">
  <h1 style="color:#ffffff;font-size:28px;font-weight:700;margin:0 0 8px;">Grace Logistics</h1>
</td></tr>

<!-- Body -->
<tr><td style="padding:40px;">
  <h2 style="color:#2563EB;font-size:22px;font-weight:600;margin:0 0 8px;">New User Registration</h2>
  <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">A new user has just registered on the rates portal.</p>

  <!-- User Details -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Name</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${firstName || ''} ${lastName || ''}</td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Email</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;"><a href="mailto:${email}" style="color:#2563EB;text-decoration:none;">${email}</a></td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Company</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${company || "N/A"}</td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Business Reg #</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${businessRegistrationNumber || "N/A"}</td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;">Role</td><td style="padding:10px 16px;font-size:14px;color:#1f2937;text-align:right;">${role || "customer"}</td></tr>
  </table>

</td></tr>

<!-- Footer -->
<tr><td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;line-height:1.6;">
    This is an automated notification from the Grace Logistics rates portal.<br>
    © ${new Date().getFullYear()} Grace Logistics. All rights reserved.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

        // Send via SMTP2GO REST API
        const smtp2goResponse = await fetch(
            "https://api.smtp2go.com/v3/email/send",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    api_key: smtp2goApiKey,
                    to: contactEmails,
                    sender: "Grace Logistics <noreply@gracelogisticslk.com>",
                    subject: emailSubject,
                    html_body: emailHtml,
                    text_body: `New User Registration\n\nName: ${firstName || ''} ${lastName || ''}\nEmail: ${email}\nCompany: ${company || 'N/A'}\nBusiness Reg #: ${businessRegistrationNumber || 'N/A'}\nRole: ${role || 'customer'}\n`,
                }),
            }
        );

        const smtp2goResult = await smtp2goResponse.json();

        if (!smtp2goResponse.ok || smtp2goResult?.data?.failed > 0) {
            console.error("SMTP2GO error:", smtp2goResult);
            return new Response(
                JSON.stringify({ error: "Failed to send notification email", details: smtp2goResult }),
                {
                    status: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: "New user notification sent" }),
            {
                status: 200,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Edge function error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            }
        );
    }
});
