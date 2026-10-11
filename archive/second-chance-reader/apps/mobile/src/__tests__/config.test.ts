import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
const { apiUrl } = await import('../config');

describe('apiUrl', () => {
  it('uses the computer serving the app when running on a phone or emulator', () => {
    expect(apiUrl(undefined, '192.168.1.20:8081')).toBe('http://192.168.1.20:8787');
  });

  it('falls back to localhost on the web dev server', () => {
    expect(apiUrl(undefined, undefined)).toBe('http://localhost:8787');
  });

  it('always prefers an explicit EXPO_PUBLIC_API_URL', () => {
    expect(apiUrl('https://api.example.org', '192.168.1.20:8081')).toBe('https://api.example.org');
  });
});
