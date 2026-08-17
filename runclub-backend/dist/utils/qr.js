"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQRDataURL = generateQRDataURL;
const qrcode_1 = __importDefault(require("qrcode"));
/**
 * Generates a base64-encoded PNG Data URL representing a QR code
 * containing ticket verification details.
 */
async function generateQRDataURL(data) {
    const payloadString = JSON.stringify({
        reg_id: data.registrationId,
        event_id: data.eventId,
        user_id: data.userId,
    });
    // Returns data:image/png;base64,...
    return qrcode_1.default.toDataURL(payloadString, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 250,
    });
}
