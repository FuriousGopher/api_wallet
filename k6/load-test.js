import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10, // virtual users
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const base = __ENV.K6_BASE_URL || 'http://api:3000';
const ids = Array.from({ length: 1000 }, (_, i) => `user-${i}`);

export default function () {
  const id = ids[Math.floor(Math.random() * ids.length)];
  const op = Math.random();
  const amount = (Math.random() * 10 + 1).toFixed(2);
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': `${id}-${__VU}-${__ITER}-${op}`,
  };

  let res;
  if (op < 0.4) {
    res = http.post(
      `${base}/wallet/${id}/deposit`,
      JSON.stringify({ amount }),
      { headers },
    );
  } else if (op < 0.8) {
    res = http.post(
      `${base}/wallet/${id}/withdraw`,
      JSON.stringify({ amount }),
      { headers },
    );
  } else {
    const toId = ids[Math.floor(Math.random() * ids.length)];
    res = http.post(
      `${base}/wallet/${id}/transfer`,
      JSON.stringify({ amount, toWalletId: toId }),
      { headers },
    );
  }

  check(res, {
    'status is 200/400/409': (r) => [200, 400, 409].includes(r.status),
  });

  sleep(0.1);
}
