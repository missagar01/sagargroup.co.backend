/**
 * WhatsApp utility for sending messages via Maytapi API.
 */

export async function sendWhatsApp(to, message) {
  const apiKey = process.env.MAYTAPI_API_KEY;
  const baseUrl = process.env.MAYTAPI_BASE_URL;
  const productId = process.env.MAYTAPI_PRODUCT_ID;
  const phoneId = process.env.MAYTAPI_PHONE_ID;

  if (!apiKey || !baseUrl || !productId || !phoneId) {
    console.warn("[whatsapp.js] Maytapi credentials missing in .env");
    return { success: false, message: "WhatsApp credentials missing" };
  }

  // Ensure +91 prefix
  let formattedNumber = to.replace(/[^0-9]/g, "");
  if (!formattedNumber.startsWith("91") && formattedNumber.length === 10) {
    formattedNumber = "91" + formattedNumber;
  }
  // The API often expects the full number with country code, sometimes without '+'
  // and it might need @c.us suffix depending on Maytapi version, but typically format is:
  // 919407916514

  const url = `${baseUrl}/${productId}/${phoneId}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-maytapi-key": apiKey,
      },
      body: JSON.stringify({
        to_number: formattedNumber,
        type: "text",
        message: message,
      }),
    });

    const data = await response.json();
    console.log("[whatsapp.js] Maytapi response:", data);
    return { success: response.ok, data };
  } catch (error) {
    console.error("[whatsapp.js] Error sending WhatsApp:", error);
    return { success: false, message: error.message };
  }
}
