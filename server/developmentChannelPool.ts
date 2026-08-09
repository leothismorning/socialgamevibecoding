export type DevelopmentChannelProvider = 'gpt5' | 'deepseek';

export type DevelopmentChannelStats = {
  waiting: number;
  active: number;
  capacity: number;
  gptActive: number;
  gptCapacity: number;
  deepSeekActive: number;
  deepSeekCapacity: number;
};

export type DevelopmentChannelQueueSnapshot = DevelopmentChannelStats & {
  position: number;
};

export type DevelopmentChannelLease = {
  provider: DevelopmentChannelProvider;
  apiKey: string;
  release: () => void;
};

type ChannelSlot = {
  provider: DevelopmentChannelProvider;
  apiKey: string;
  busy: boolean;
};

type QueueWaiter = {
  resolve: (lease: DevelopmentChannelLease) => void;
  onQueued?: (snapshot: DevelopmentChannelQueueSnapshot) => void;
  providerOrder: DevelopmentChannelProvider[];
};

const DEFAULT_PROVIDER_ORDER: DevelopmentChannelProvider[] = ['deepseek', 'gpt5'];

function uniqueKeys(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function configuredDeepSeekFallbackKeys(environment: NodeJS.ProcessEnv = process.env) {
  const listKeys = String(environment.DEEPSEEK_FALLBACK_API_KEYS || '')
    .split(/[;,\r\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const namedKeys = Object.entries(environment)
    .filter(([name]) => (
      name === 'DEEPSEEK_FALLBACK_API_KEY'
      || /^DEEPSEEK_FALLBACK_API_KEY_\d+$/.test(name)
    ))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, value]) => value);
  const dedicatedKeys = uniqueKeys([...namedKeys, ...listKeys]);
  return dedicatedKeys.length
    ? dedicatedKeys
    : uniqueKeys([environment.DEEPSEEK_API_KEY]);
}

export class DevelopmentChannelPool {
  private readonly slots: ChannelSlot[];
  private readonly waiters: QueueWaiter[] = [];

  constructor(gptApiKeys: string[], deepSeekApiKeys: string[] = []) {
    this.slots = [
      ...uniqueKeys(gptApiKeys).map<ChannelSlot>((apiKey) => ({
        provider: 'gpt5',
        apiKey,
        busy: false,
      })),
      ...uniqueKeys(deepSeekApiKeys).map<ChannelSlot>((apiKey) => ({
        provider: 'deepseek',
        apiKey,
        busy: false,
      })),
    ];
  }

  stats(): DevelopmentChannelStats {
    const gptSlots = this.slots.filter((slot) => slot.provider === 'gpt5');
    const deepSeekSlots = this.slots.filter((slot) => slot.provider === 'deepseek');
    return {
      waiting: this.waiters.length,
      active: this.slots.filter((slot) => slot.busy).length,
      capacity: this.slots.length,
      gptActive: gptSlots.filter((slot) => slot.busy).length,
      gptCapacity: gptSlots.length,
      deepSeekActive: deepSeekSlots.filter((slot) => slot.busy).length,
      deepSeekCapacity: deepSeekSlots.length,
    };
  }

  acquire(
    onQueued?: (snapshot: DevelopmentChannelQueueSnapshot) => void,
    providerOrder: DevelopmentChannelProvider[] = DEFAULT_PROVIDER_ORDER,
  ) {
    const allowedProviders = [...new Set(providerOrder)];
    if (!this.slots.some((slot) => allowedProviders.includes(slot.provider))) {
      return Promise.reject(new Error('No requested development API channel is configured on the server.'));
    }
    const available = this.availableSlot(allowedProviders);
    if (available) return Promise.resolve(this.createLease(available));
    return new Promise<DevelopmentChannelLease>((resolve) => {
      this.waiters.push({ resolve, onQueued, providerOrder: allowedProviders });
      this.notifyQueue();
    });
  }

  private availableSlot(providerOrder: DevelopmentChannelProvider[] = DEFAULT_PROVIDER_ORDER) {
    for (const provider of providerOrder) {
      const slot = this.slots.find((candidate) => candidate.provider === provider && !candidate.busy);
      if (slot) return slot;
    }
    return undefined;
  }

  private createLease(slot: ChannelSlot): DevelopmentChannelLease {
    slot.busy = true;
    let released = false;
    return {
      provider: slot.provider,
      apiKey: slot.apiKey,
      release: () => {
        if (released) return;
        released = true;
        slot.busy = false;
        this.dispatch();
      },
    };
  }

  private dispatch() {
    while (this.waiters.length) {
      const waiterIndex = this.waiters.findIndex((waiter) => Boolean(this.availableSlot(waiter.providerOrder)));
      if (waiterIndex < 0) break;
      const waiter = this.waiters.splice(waiterIndex, 1)[0];
      const available = this.availableSlot(waiter.providerOrder);
      if (!available) break;
      waiter.resolve(this.createLease(available));
    }
    this.notifyQueue();
  }

  private notifyQueue() {
    const stats = this.stats();
    this.waiters.forEach((waiter, index) => waiter.onQueued?.({
      ...stats,
      position: index + 1,
    }));
  }
}

let sharedPool: DevelopmentChannelPool | null = null;
let sharedSignature = '';

export function getDevelopmentChannelPool() {
  const gptKeys = uniqueKeys([process.env.SUIXIANG_API_KEY]);
  const deepSeekKeys = configuredDeepSeekFallbackKeys();
  const signature = `${gptKeys.join('\u0000')}\u0001${deepSeekKeys.join('\u0000')}`;
  if (!sharedPool || signature !== sharedSignature) {
    sharedPool = new DevelopmentChannelPool(gptKeys, deepSeekKeys);
    sharedSignature = signature;
  }
  return sharedPool;
}

export async function withDevelopmentChannel<T>(
  task: (lease: DevelopmentChannelLease) => Promise<T>,
  options: {
    onQueued?: (snapshot: DevelopmentChannelQueueSnapshot) => void;
    providerOrder?: DevelopmentChannelProvider[];
    onAcquired?: (
      snapshot: DevelopmentChannelStats & { provider: DevelopmentChannelProvider },
    ) => void;
  } = {},
) {
  const pool = getDevelopmentChannelPool();
  const lease = await pool.acquire(options.onQueued, options.providerOrder);
  options.onAcquired?.({ ...pool.stats(), provider: lease.provider });
  try {
    return await task(lease);
  } finally {
    lease.release();
  }
}
