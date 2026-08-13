import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const successRate = new Rate('success_rate');

export const options = {
  scenarios: {
    ya_scenario: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 50,
      stages: [
        { duration: '5m', target: 60 },
        { duration: '10m', target: 60 },
        { duration: '5m', target: 72 },
        { duration: '10m', target: 72 },
      ],
      exec: 'yaScenario',
    },
    www_scenario: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 20,
      maxVUs: 100,
      stages: [
        { duration: '5m', target: 120 },
        { duration: '10m', target: 120 },
        { duration: '5m', target: 144 },
        { duration: '10m', target: 144 },
      ],
      exec: 'wwwScenario',
    },
  },

  thresholds: {
    'http_req_failed': ['rate<0.05'],
    'http_req_duration': ['p(95)<5000'],
    'http_req_duration{type:ya}': ['p(95)<3000'],
    'http_req_duration{type:www}': ['p(95)<5000'],
  },
};

export function yaScenario() {
  const response = http.get('https://ya.ru/', {
    tags: { type: 'ya' },
  });

  check(response, {
    'ya.ru status is 200': (r) => r.status === 200,
  });

  successRate.add(response.status === 200);
}

export function wwwScenario() {
  const response = http.get('http://www.ru/', {
    tags: { type: 'www' },
  });

  check(response, {
    'www.ru status is 200': (r) => r.status === 200,
  });

  successRate.add(response.status === 200);
}