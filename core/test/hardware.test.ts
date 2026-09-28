import { describe, expect, it } from 'vitest';
import { detectHardware, mergeConfig, resolveAvailable, validateConfig, type HardwareProbe } from '../src/index.ts';

const probe = (over: Partial<HardwareProbe>): HardwareProbe => ({
  platform: 'linux', arch: 'x64', cpuFlags: () => [], nvidiaGpus: () => [], env: {}, ...over,
});
const tags = (p: HardwareProbe) => resolveAvailable(detectHardware(p));

describe('detectHardware', () => {
  it('x86 Linux server with AVX-512, a GPU and an API key', () => {
    expect(tags(probe({
      cpuFlags: () => ['fpu', 'avx2', 'avx512f'], nvidiaGpus: () => ['NVIDIA A100'], env: { ANTHROPIC_API_KEY: 'k' },
    }))).toEqual(['gpu', 'x86', 'avx512', 'linux', 'llm-api']);
  });
  it('Apple Silicon Mac', () => {
    expect(tags(probe({ platform: 'darwin', arch: 'arm64' }))).toEqual(['arm']);
  });
  it('--with / --without override detection', () => {
    const d = detectHardware(probe({ platform: 'darwin', arch: 'arm64' }));
    expect(resolveAvailable(d, ['llm-api'], ['arm'])).toEqual(['llm-api']);
  });
});

describe('config layering', () => {
  it('local config replaces hardware.available and keeps other values', () => {
    const c = mergeConfig({ hardware: { available: ['linux'] }, writeup: { minWords: 300 } }, { hardware: { available: ['arm'] } });
    expect(c.hardware.available).toEqual(['arm']);
    expect(c.writeup.minWords).toBe(300);
    expect(c.visibility.radiusBase).toBe(150);
  });
  it('flags unknown hardware tags', () => {
    expect(validateConfig(mergeConfig({ hardware: { available: ['cuda' as never] } }))).toEqual([
      'hardware.available: unknown tag "cuda" (expected gpu, arm, x86, avx512, linux, llm-api)',
    ]);
  });
});
