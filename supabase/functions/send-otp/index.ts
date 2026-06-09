import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, code } = await req.json()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'KaySales Management System <onboarding@resend.dev>',
        to: [email],
        subject: 'KaySales - Your Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1d4ed8; text-align: center;">KaySales Management System</h1>
            <h2 style="color: #374151; text-align: center;">Verification Code</h2>
            <p style="color: #6b7280; text-align: center;">Use this 6-digit code to verify your action. It expires in 5 minutes.</p>
            <div style="text-align: center; margin: 30px 0;">
              <div style="background-color: #1e293b; color: #ffffff; font-size: 36px; font-weight: bold; letter-spacing: 12px; padding: 20px 40px; border-radius: 12px; display: inline-block;">
                ${code}
              </div>
            </div>
            <p style="color: #6b7280; text-align: center; font-size: 14px;">Do not share this code with anyone.</p>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">If you did not request this code, please ignore this email.</p>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})