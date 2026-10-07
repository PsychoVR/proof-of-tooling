const SIGNING_DOMAIN = Uint8Array.from([
  0xff,
  ...Array.from("solana offchain", (c) => c.charCodeAt(0)),
]);
export const OFFCHAIN_MAX_MESSAGE_BYTES = 1212;

/**
 * Wraps the message in the Solana off-chain message v0 envelope:
 * domain (16 bytes) | version 0 | format | u16le length | message.
 * Format 0 is restricted ASCII, format 1 is limited UTF-8.
 */
export function serializeOffchainV0(message: string): Uint8Array {
  const body = new TextEncoder().encode(message);
  if (body.length === 0) throw new RangeError("offchain message is empty");
  if (body.length > OFFCHAIN_MAX_MESSAGE_BYTES) {
    throw new RangeError(`offchain message exceeds ${OFFCHAIN_MAX_MESSAGE_BYTES} bytes`);
  }
  const restricted = body.every((b) => b >= 0x20 && b <= 0x7e);
  const out = new Uint8Array(20 + body.length);
  out.set(SIGNING_DOMAIN, 0);
  out[16] = 0;
  out[17] = restricted ? 0 : 1;
  out[18] = body.length & 0xff;
  out[19] = body.length >> 8;
  out.set(body, 20);
  return out;
}
