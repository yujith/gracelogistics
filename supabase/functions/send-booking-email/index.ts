// @ts-nocheck — This file runs in Supabase's Deno runtime, not locally.
// Follow this Supabase Edge Function guide for more info:
// https://supabase.com/docs/guides/functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }

    try {
        const body = await req.json();
        const {
            customerName,
            customerEmail,
            customerPhone,
            customerNotes,
            origin,
            destination,
            container,
            quantity,
            commodity,
            ratePerContainer,
      freightTotal,
      blFee,
      grandTotal,
      readyDate,
    } = body;

        // Validate required fields
        if (!customerName || !customerEmail || !origin || !destination) {
            return new Response(
                JSON.stringify({ error: "Missing required fields" }),
                {
                    status: 400,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                }
            );
        }

        // Get contact emails from platform_settings via Supabase
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const smtp2goApiKey = Deno.env.get("SMTP2GO_API_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: settings } = await supabase
            .from("platform_settings")
            .select("value")
            .eq("key", "contact_email")
            .single();

        const contactEmailStr =
            settings?.value || "niroshan.s@gracelogisticslk.com";

        // Parse multiple emails (stored one per line or comma-separated)
        const contactEmails = contactEmailStr
            .split(/[\n,]+/)
            .map((e: string) => e.trim())
            .filter((e: string) => e.length > 0 && e.includes("@"));

        if (contactEmails.length === 0) {
            return new Response(
                JSON.stringify({ error: "No contact emails configured" }),
                {
                    status: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                }
            );
        }

        // Build the commodity row if present
        const commodityRow = commodity
            ? `<tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Commodity</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${commodity}</td></tr>`
            : "";

        // Build the D/O Fee row if present
        const blFeeVal = parseFloat(blFee || "0");
        const blRow =
            blFeeVal > 0
                ? `<tr><td style="padding:10px 16px;color:#6366f1;font-size:14px;border-bottom:1px solid #f3f4f6;">D/O Fee</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#6366f1;border-bottom:1px solid #f3f4f6;text-align:right;">$${blFeeVal.toFixed(2)} USD</td></tr>`
                : "";

        // Generate a date-based reference ID: GL-YYYYMMDD-HHmm
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const refId = `GL-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

        const emailSubject = `[${refId}] Booking: ${origin} → ${destination} — ${customerName}`;
        const websiteRatesUrl =
            Deno.env.get("WEBSITE_RATES_URL") || "https://gracelogisticslk.com/rates/";

        const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:40px 40px 30px;text-align:center;">
  <h1 style="color:#ffffff;font-size:28px;font-weight:700;margin:0 0 8px;">Grace Logistics</h1>
  <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;letter-spacing:1px;">SHIPPING · LOGISTICS · SUPPLY CHAIN</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:40px;">
  <h2 style="color:#1e40af;font-size:22px;font-weight:600;margin:0 0 8px;">Booking Request Summary</h2>
  <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Here are the details for the booking request submitted through the <a href="${websiteRatesUrl}" style="color:#1e40af;text-decoration:none;font-weight:600;">rates portal</a>.</p>

  <!-- Route Banner -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:12px;margin-bottom:24px;">
  <tr><td style="padding:20px;text-align:center;">
    <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Route</p>
    <p style="color:#1e40af;font-size:20px;font-weight:700;margin:0;">${origin} → ${destination}</p>
  </td></tr>
  </table>

  <!-- Shipment Details -->
  <p style="color:#1f2937;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Shipment Details</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Container</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${container}</td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Quantity</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${quantity}</td></tr>
    ${commodityRow}
    ${readyDate ? `<tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Cargo Ready Date</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${readyDate}</td></tr>` : ''}
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Rate / Container</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">$${parseFloat(ratePerContainer).toFixed(2)} USD</td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Freight Total</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">$${parseFloat(freightTotal).toFixed(2)} USD</td></tr>
    ${blRow}
    <tr style="background-color:#f9fafb;"><td style="padding:12px 16px;color:#1e40af;font-size:15px;font-weight:700;">Grand Total</td><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#1e40af;text-align:right;">$${parseFloat(grandTotal).toFixed(2)} USD</td></tr>
  </table>

  <!-- Customer Details -->
  <p style="color:#1f2937;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Customer Information</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Name</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${customerName}</td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Email</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;"><a href="mailto:${customerEmail}" style="color:#1e40af;text-decoration:none;">${customerEmail}</a></td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Phone</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6;text-align:right;">${customerPhone || "N/A"}</td></tr>
    <tr><td style="padding:10px 16px;color:#6b7280;font-size:14px;">Notes</td><td style="padding:10px 16px;font-size:14px;color:#1f2937;text-align:right;">${customerNotes || "None"}</td></tr>
  </table>

  <!-- Reply CTA removed at user request -->

</td></tr>

<!-- Footer -->
<tr><td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;line-height:1.6;">
    This is an automated booking notification from the Grace Logistics rates portal.<br>
    <a href="${websiteRatesUrl}" style="color:#1e40af;text-decoration:none;">Open rates portal</a><br>
    © ${new Date().getFullYear()} Grace Logistics. All rights reserved.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

        // Instead of BCC which can be unreliable via API, we will send two explicitly targeted emails.
        
        // 1. Send to Customer
        const customerResponse = await fetch(
            "https://api.smtp2go.com/v3/email/send",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    api_key: smtp2goApiKey,
                    to: [customerEmail],
                    sender: "Grace Logistics <noreply@gracelogisticslk.com>",
                    subject: `[Copy] ${emailSubject}`,
                    html_body: emailHtml,
                    text_body: `New Booking Request\n\nRoute: ${origin} → ${destination}\nContainer: ${container}\nQuantity: ${quantity}\n${commodity ? `Commodity: ${commodity}\n` : ""}${readyDate ? `Cargo Ready Date: ${readyDate}\n` : ""}Rate/Container: $${ratePerContainer} USD\nFreight Total: $${freightTotal} USD\n${blFeeVal > 0 ? `Delivery Order Fee: $${blFeeVal.toFixed(2)} USD\n` : ""}Grand Total: $${grandTotal} USD\n\nRates Portal: ${websiteRatesUrl}\n\nCustomer: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone || "N/A"}\nNotes: ${customerNotes || "None"}`,
                }),
            }
        );

        // 2. Send to Staff
        const staffResponse = await fetch(
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
                    text_body: `New Booking Request\n\nRoute: ${origin} → ${destination}\nContainer: ${container}\nQuantity: ${quantity}\n${commodity ? `Commodity: ${commodity}\n` : ""}${readyDate ? `Cargo Ready Date: ${readyDate}\n` : ""}Rate/Container: $${ratePerContainer} USD\nFreight Total: $${freightTotal} USD\n${blFeeVal > 0 ? `Delivery Order Fee: $${blFeeVal.toFixed(2)} USD\n` : ""}Grand Total: $${grandTotal} USD\n\nRates Portal: ${websiteRatesUrl}\n\nCustomer: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone || "N/A"}\nNotes: ${customerNotes || "None"}`,
                }),
            }
        );

        const staffResult = await staffResponse.json();

        if (!staffResponse.ok || staffResult?.data?.failed > 0) {
            console.error("SMTP2GO staff email error:", staffResult);
            return new Response(
                JSON.stringify({ error: "Failed to send staff email", details: staffResult }),
                {
                    status: 500,
                    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
                }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: "Booking request sent" }),
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
