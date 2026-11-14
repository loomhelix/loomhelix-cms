import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duplex } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME_PATHS: Readonly<Partial<Record<NodeJS.Platform, string>>> = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: 'google-chrome',
};
const COMMAND_PIPE = 3;
const EVENT_PIPE = 4;
const MESSAGE_END = '\0';
const FAVICON_PATH = '/favicon.ico';
const WAIT_LIMIT = 5000;
const WAIT_STEP = 50;
const VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };

interface EventParams {
  readonly exceptionDetails?: { readonly text: string; readonly exception?: Described };
  readonly type?: string;
  readonly args?: readonly Described[];
  readonly entry?: { readonly level: string; readonly text: string; readonly url?: string };
}

interface Described {
  readonly value?: unknown;
  readonly description?: string;
}

interface Message {
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: { readonly message: string };
  readonly method?: string;
  readonly params?: EventParams;
  readonly sessionId?: string;
}

interface Evaluation<Value> {
  readonly result: { readonly value: Value };
  readonly exceptionDetails?: { readonly text: string; readonly exception?: Described };
}

type Send = <Result>(
  method: string,
  params?: Readonly<Record<string, unknown>>,
  sessionId?: string,
) => Promise<Result>;

type Listener = (method: string, params: EventParams) => void;

export interface Page {
  readonly errors: readonly string[];
  evaluate<Value>(expression: string): Promise<Value>;
  waitFor(expression: string): Promise<void>;
  click(x: number, y: number): Promise<void>;
  chooseFiles(inputExpression: string, files: readonly string[]): Promise<void>;
  close(): Promise<void>;
}

export interface Browser {
  openPage(url: string): Promise<Page>;
  close(): Promise<void>;
}

const ERROR_TEXTS: ReadonlyMap<string, (params: EventParams) => string | undefined> = new Map([
  [
    'Runtime.exceptionThrown',
    ({ exceptionDetails }: EventParams) =>
      exceptionDetails?.exception?.description ?? exceptionDetails?.text,
  ],
  [
    'Runtime.consoleAPICalled',
    ({ type, args = [] }: EventParams) =>
      type === 'error'
        ? args.map(({ value, description }) => description ?? String(value)).join(' ')
        : undefined,
  ],
  [
    'Log.entryAdded',
    ({ entry }: EventParams) =>
      entry?.level === 'error' && !isFaviconRequest(entry.url)
        ? `${entry.text} ${entry.url ?? ''}`.trim()
        : undefined,
  ],
]);

function isFaviconRequest(url = ''): boolean {
  return URL.parse(url)?.pathname === FAVICON_PATH;
}

export async function startChrome(): Promise<Browser> {
  const chromePath = process.env.CHROME_PATH ?? CHROME_PATHS[process.platform] ?? 'chrome';
  const profile = await mkdtemp(join(tmpdir(), 'lhcms-chrome-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless',
      '--no-sandbox',
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  try {
    await once(chrome, 'spawn');
  } catch (error) {
    await rm(profile, { recursive: true, force: true });
    throw new Error(
      `Chrome does not start from "${chromePath}". Install Google Chrome, or set CHROME_PATH.`,
      {
        cause: error,
      },
    );
  }
  const { send, listen } = connect(pipeOf(chrome, COMMAND_PIPE), pipeOf(chrome, EVENT_PIPE));
  return {
    openPage: (url) => openPage(send, listen, url),
    close: async () => {
      const exit = once(chrome, 'exit');
      void send('Browser.close');
      await exit;
      await rm(profile, { recursive: true, force: true });
    },
  };
}

function pipeOf(chrome: ChildProcess, descriptor: number): Duplex {
  const pipe = chrome.stdio[descriptor];
  if (!(pipe instanceof Duplex)) {
    throw new Error(`Chrome has no pipe on the file descriptor ${descriptor}.`);
  }
  return pipe;
}

function connect(commands: Duplex, events: Duplex) {
  const pending = new Map<number, (message: Message) => void>();
  const listeners = new Map<string, Listener>();
  let nextId = 1;
  let buffer = '';
  events.setEncoding('utf8');
  events.on('data', (chunk: string) => {
    const parts = (buffer + chunk).split(MESSAGE_END);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      receive(JSON.parse(part));
    }
  });

  function receive(message: Message) {
    if (message.id !== undefined) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
      return;
    }
    if (message.method !== undefined && message.sessionId !== undefined) {
      listeners.get(message.sessionId)?.(message.method, message.params ?? {});
    }
  }

  function send<Result>(
    method: string,
    params: Readonly<Record<string, unknown>> = {},
    sessionId?: string,
  ): Promise<Result> {
    return new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, ({ result, error }) => {
        if (error === undefined) {
          resolve(result as Result);
        } else {
          reject(new Error(`Chrome rejects ${method}: ${error.message}`));
        }
      });
      commands.write(JSON.stringify({ id, method, params, sessionId }) + MESSAGE_END);
    });
  }

  return {
    send,
    listen: (sessionId: string, listener: Listener) => listeners.set(sessionId, listener),
  };
}

async function openPage(
  send: Send,
  listen: (sessionId: string, listener: Listener) => void,
  url: string,
): Promise<Page> {
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', {
    url: 'about:blank',
  });
  const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  const errors: string[] = [];
  listen(sessionId, (method, params) => {
    const text = ERROR_TEXTS.get(method)?.(params);
    if (text !== undefined) {
      errors.push(text);
    }
  });
  await Promise.all(
    ['Runtime.enable', 'Log.enable', 'Page.enable'].map((method) => send(method, {}, sessionId)),
  );
  await send('Emulation.setDeviceMetricsOverride', VIEWPORT, sessionId);
  await send('Page.navigate', { url }, sessionId);

  async function evaluate<Value>(expression: string): Promise<Value> {
    const { result, exceptionDetails } = await send<Evaluation<Value>>(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (exceptionDetails !== undefined) {
      throw new Error(
        `The page cannot evaluate ${expression}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
      );
    }
    return result.value;
  }

  return {
    errors,
    evaluate,
    waitFor: async (expression) => {
      const end = Date.now() + WAIT_LIMIT;
      const check = `(() => { try { return Boolean(${expression}); } catch { return false; } })()`;
      while (!(await evaluate<boolean>(check))) {
        if (Date.now() > end) {
          throw new Error(`The page does not get to the state ${expression} in ${WAIT_LIMIT} ms.`);
        }
        await delay(WAIT_STEP);
      }
    },
    click: async (x, y) => {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send(
          'Input.dispatchMouseEvent',
          { type, x, y, button: 'left', clickCount: 1 },
          sessionId,
        );
      }
    },
    chooseFiles: async (inputExpression, files) => {
      const { result } = await send<{ result: { objectId?: string } }>(
        'Runtime.evaluate',
        { expression: inputExpression },
        sessionId,
      );
      await send('DOM.setFileInputFiles', { files, objectId: result.objectId }, sessionId);
    },
    close: async () => {
      await send('Target.closeTarget', { targetId });
    },
  };
}
