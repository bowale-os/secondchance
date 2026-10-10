// Must be imported before anything that encrypts. Phones (Hermes) have no
// crypto.getRandomValues, which the encryption library needs for keys and nonces.
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: Partial<Crypto> };
if (!g.crypto) g.crypto = {};
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = getRandomValues as Crypto['getRandomValues'];
