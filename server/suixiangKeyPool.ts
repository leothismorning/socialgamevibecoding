export type SuiXiangQueueSnapshot = {
  position: number;
  waiting: number;
  active: number;
  capacity: number;
};

export type SuiXiangKeyLease = {
  apiKey: string;
  release: () => void;
};

type KeySlot = {
  apiKey: string;
  busy: boolean;
};

type QueueWaiter = {
  resolve: (lease: SuiXiangKeyLease) => void;
  onQueued?: (snapshot: SuiXiangQueueSnapshot) => void;
};

function uniqueKeys(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function configuredSuiXiangKeys(environment: NodeJS.ProcessEnv = process.env) {
  const listKeys = String(environment.SUIXIANG_API_KEYS || '')
    .split(/[;,\r\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const namedKeys = Object.entries(environment)
    .filter(([name]) => (
      name === 'SUIXIANG_API_KEY'
      || /^SUIXIANG_API_KEY_APP\d+$/.test(name)
      || /^SUIXIANG_API_KEY_POOL_\d+$/.test(name)
    ))
    .sort(([left], [right]) => {
      if (left === 'SUIXIANG_API_KEY') return -1;
      if (right === 'SUIXIANG_API_KEY') return 1;
      return left.localeCompare(right, undefined, { numeric: true });
    })
    .map(([, value]) => value);
  return uniqueKeys([...namedKeys, ...listKeys]);
}

export class SuiXiangKeyPool {
  private readonly slots: KeySlot[];
  private readonly waiters: QueueWaiter[] = [];

  constructor(apiKeys: string[]) {
    this.slots = uniqueKeys(apiKeys).map((apiKey) => ({ apiKey, busy: false }));
  }

  stats() {
    return {
      capacity: this.slots.length,
      active: this.slots.filter((slot) => slot.busy).length,
      waiting: this.waiters.length,
    };
  }

  acquire(onQueued?: (snapshot: SuiXiangQueueSnapshot) => void): Promise<SuiXiangKeyLease> {
    if (!this.slots.length) {
      return Promise.reject(new Error('SUIXIANG_API_KEY is not configured on the server.'));
    }
    const available = this.slots.find((slot) => !slot.busy);
    if (available) return Promise.resolve(this.createLease(available));
    return new Promise((resolve) => {
      this.waiters.push({ resolve, onQueued });
      this.notifyQueue();
    });
  }

  private createLease(slot: KeySlot): SuiXiangKeyLease {
    slot.busy = true;
    let released = false;
    return {
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
      const available = this.slots.find((slot) => !slot.busy);
      if (!available) break;
      const waiter = this.waiters.shift()!;
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

let sharedPool: SuiXiangKeyPool | null = null;
let sharedSignature = '';

export function getSuiXiangKeyPool() {
  const keys = configuredSuiXiangKeys();
  const signature = keys.join('\u0000');
  if (!sharedPool || signature !== sharedSignature) {
    sharedPool = new SuiXiangKeyPool(keys);
    sharedSignature = signature;
  }
  return sharedPool;
}

export async function withSuiXiangKey<T>(
  task: (apiKey: string) => Promise<T>,
  options: {
    onQueued?: (snapshot: SuiXiangQueueSnapshot) => void;
    onAcquired?: (snapshot: Omit<SuiXiangQueueSnapshot, 'position'>) => void;
  } = {},
) {
  const pool = getSuiXiangKeyPool();
  const lease = await pool.acquire(options.onQueued);
  options.onAcquired?.(pool.stats());
  try {
    return await task(lease.apiKey);
  } finally {
    lease.release();
  }
}
