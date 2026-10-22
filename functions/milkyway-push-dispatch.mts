import { dispatchPush } from '../lib/push-delivery.js';

export default async function handler() {
  await dispatchPush();
}

export const config = { schedule: '* * * * *' };
