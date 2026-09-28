import { REQUIRE_TAGS, type RequireTag } from './types.ts';

/** What `stratum setup` can observe about the machine. Injected so detection is testable. */
export interface HardwareProbe {
  platform: string;             // process.platform
  arch: string;                 // process.arch
  cpuFlags: () => string[];     // lower-case CPU feature flags; [] if unknown
  nvidiaGpus: () => string[];   // names of CUDA-capable GPUs; [] if none or no driver
  env: Record<string, string | undefined>;
}

export interface TagDetection {
  tag: RequireTag;
  available: boolean;
  reason: string;
}

export function detectHardware(probe: HardwareProbe): TagDetection[] {
  const flags = new Set(probe.cpuFlags());
  const gpus = probe.nvidiaGpus();
  const hasKey = Boolean(probe.env.ANTHROPIC_API_KEY);
  const checks: Record<RequireTag, [boolean, string]> = {
    linux: [probe.platform === 'linux', `platform is ${probe.platform}`],
    x86: [probe.arch === 'x64', `arch is ${probe.arch}`],
    arm: [probe.arch === 'arm64', `arch is ${probe.arch}`],
    avx512: [flags.has('avx512f'), probe.arch !== 'x64' ? `arch is ${probe.arch}`
      : flags.size ? (flags.has('avx512f') ? 'CPU reports avx512f' : 'CPU lacks avx512f') : 'CPU flags unavailable'],
    gpu: [gpus.length > 0, gpus.length ? `nvidia-smi: ${gpus.join(', ')}` : 'no NVIDIA GPU found (nvidia-smi)'],
    'llm-api': [hasKey, hasKey ? 'ANTHROPIC_API_KEY is set' : 'ANTHROPIC_API_KEY is not set'],
  };
  return REQUIRE_TAGS.map((tag) => ({ tag, available: checks[tag][0], reason: checks[tag][1] }));
}

/** Detected tags, adjusted by explicit --with / --without overrides. Output keeps REQUIRE_TAGS order. */
export function resolveAvailable(detected: TagDetection[], withTags: RequireTag[] = [], withoutTags: RequireTag[] = []): RequireTag[] {
  const set = new Set(detected.filter((d) => d.available).map((d) => d.tag));
  for (const t of withTags) set.add(t);
  for (const t of withoutTags) set.delete(t);
  return REQUIRE_TAGS.filter((t) => set.has(t));
}
