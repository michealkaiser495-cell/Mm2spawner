// @solana/web3.js and @solana/spl-token expect Node's Buffer. Must be imported first.
import { Buffer } from 'buffer';

if (!(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}
