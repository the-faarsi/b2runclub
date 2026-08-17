import QRCode from "qrcode";

/**
 * Generates a base64-encoded PNG Data URL representing a QR code
 * containing ticket verification details.
 */
export async function generateQRDataURL(data: {
    registrationId: string;
    eventId: string;
    userId: string;
    userName: string;
    eventTitle: string;
}): Promise<string> {
    const payloadString = JSON.stringify({
        reg_id: data.registrationId,
        event_id: data.eventId,
        user_id: data.userId,
    });

    // Returns data:image/png;base64,...
    return QRCode.toDataURL(payloadString, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 250,
    });
}
