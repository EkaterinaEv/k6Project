import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const successRate = new Rate('success_rate');

export const options = {
  scenarios: {
    // Сценарий для ya.ru
    ya_scenario: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 5,
      maxVUs: 20,
      stages: [
        // 2 минуты разгон до 60 запросов/мин
        { duration: '2m', target: 60 },
        // 3 минуты 60 запросов/мин
        { duration: '3m', target: 60 },
      ],
      exec: 'yaScenario',
    },
    // Сценарий для www.ru
    www_scenario: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 40,
      stages: [
        // 2 минуты разгон до 120 запросов/мин
        { duration: '2m', target: 120 },
        // 3 минуты 120 запросов/мин
        { duration: '3m', target: 120 },
      ],
      exec: 'wwwScenario',
    },
  },

  thresholds: {
    'http_req_failed': ['rate<0.05'], // меньше 5% ошибок
    'http_req_duration': ['p(95)<5000'], // 95% запросов быстрее 5 секунд
  },
};

// Сценарий для ya.ru
export function yaScenario() {
  const response = http.get('https://ya.ru/');

  check(response, {
    'ya.ru status is 200': (r) => r.status === 200,
  });

  successRate.add(response.status === 200);
}

// Сценарий для www.ru
export function wwwScenario() {
  const response = http.get('http://www.ru/'); // ← ИЗМЕНЕНО на http://

  check(response, {
    'www.ru status is 200': (r) => r.status === 200,
  });

  successRate.add(response.status === 200);
}

export function handleSummary(data) {
  console.log('=== Результаты теста ===');
  console.log(`Всего запросов: ${data.metrics.http_reqs.values.count}`);
  console.log(`Успешных запросов: ${data.metrics.http_reqs.values.rate}`);
  console.log(`Среднее время ответа: ${data.metrics.http_req_duration.values.avg} ms`);
  console.log(`95-й перцентиль: ${data.metrics.http_req_duration.values['p(95)']} ms`);
  console.log(`Процент ошибок: ${data.metrics.http_req_failed.values.rate * 100}%`);

  return {
    'summary.json': JSON.stringify(data, null, 2),
  };
}