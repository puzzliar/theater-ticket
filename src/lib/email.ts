import "server-only";

// Resend による送信(RESEND_API_KEY 設定時のみ)。未設定時は no-op。
// 開演1時間前のQR自動送付(要件5.4)は Vercel Cron + /api/cron/send-reminders で行う。
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "PUZZLIAR チケット <tickets@puzzliar.jp>";
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
