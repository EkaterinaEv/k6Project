import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';

// Загрузка тестовых данных из CSV файлов
const users = new SharedArray('users', function () {
  return papaparse.parse(open('./users.csv'), { header: true }).data;
});

const passengers = new SharedArray('passengers', function () {
  return papaparse.parse(open('./passengers.csv'), { header: true }).data;
});

// Конфигурация
const BASE_URL = 'http://webtours.load-test.ru:1080';
const CITIES = ['Denver', 'Frankfurt', 'London', 'Los Angeles', 'Paris',
                'Portland', 'San Francisco', 'Seattle', 'Sydney', 'Zurich'];

// Вспомогательная функция для генерации случайных дат
function getRandomDates() {
  const today = new Date();
  const departDate = new Date(today);
  departDate.setDate(today.getDate() + 1 + Math.floor(Math.random() * 30));

  const returnDate = new Date(departDate);
  returnDate.setDate(departDate.getDate() + 7 + Math.floor(Math.random() * 23));

  const formatDate = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  return {
    departDate: formatDate(departDate),
    returnDate: formatDate(returnDate)
  };
}

// Генератор случайных городов
function getRandomCityPair() {
  const shuffled = [...CITIES].sort(() => Math.random() - 0.5);
  return {
    departCity: shuffled[0],
    arriveCity: shuffled[1]
  };
}

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<5000', 'p(99)<8000', 'avg<3000'],
  },
};

export default function () {
  // Получаем пользователя и пассажира из CSV
  const user = users[0];
  const passenger = passengers[0];

  // 1. GET Main Page
  console.log('1. Загрузка главной страницы');
  const mainPageResp = http.get(`${BASE_URL}/webtours/`);
  check(mainPageResp, {
    'status code main is 200': (r) => r.status === 200,
    'title is Web Tours': (r) => r.html('title').text() === 'Web Tours',
  });
  sleep(Math.random() * 2 + 1); // pause 1-3 seconds

  // 2. Create Session
  console.log('2. Создание сессии');
  const sessionResp = http.get(`${BASE_URL}/cgi-bin/welcome.pl?signOff=true`);
  let msoCookie = '';
  if (sessionResp.headers['Set-Cookie']) {
    const match = sessionResp.headers['Set-Cookie'].match(/MSO=([^;]+)/);
    if (match) {
      msoCookie = match[1];
    }
  }
  check(sessionResp, {
    'status code session is 200': (r) => r.status === 200,
  });
  sleep(Math.random() * 2 + 1);

  // 3. Get Navbar
  console.log('3. Загрузка навигационной панели');
  const navbarResp = http.get(`${BASE_URL}/cgi-bin/nav.pl?in=home`);
  let userSession = '';
  const navbarHtml = navbarResp.html();
  const userSessionInput = navbarHtml.find('input[name="userSession"]');
  if (userSessionInput) {
    userSession = userSessionInput.attr('value') || '';
  }
  check(navbarResp, {
    'status code navbar is 200': (r) => r.status === 200,
    'title is Web Tours Navigation Bar': (r) => r.html('title').text() === 'Web Tours Navigation Bar',
  });
  sleep(Math.random() * 2 + 1);

  // 4. Login
  console.log('4. Вход в систему');
  const loginResp = http.post(`${BASE_URL}/cgi-bin/login.pl`, {
    userSession: userSession,
    username: user.username || 'testuser',
    password: user.password || 'testpass',
    'login.x': '69',
    'login.y': '3',
    JSFormSubmit: 'off',
  });
  check(loginResp, {
    'status code login is 200': (r) => r.status === 200,
    'User password was correct': (r) => r.body.includes('User password was correct'),
    'title is Web Tours': (r) => r.html('title').text() === 'Web Tours',
  });
  sleep(Math.random() * 2 + 1);

  // 5. Go to Flights
  console.log('5. Переход к поиску билетов');
  const flightsResp = http.get(`${BASE_URL}/cgi-bin/nav.pl?page=menu&in=flights`);
  check(flightsResp, {
    'status code flights is 200': (r) => r.status === 200,
    'Flights exists': (r) => r.body.includes('Flights'),
  });
  sleep(Math.random() * 2 + 1);

  // 6. Go to Reservation
  console.log('6. Переход к форме бронирования');
  const reservationResp = http.get(`${BASE_URL}/cgi-bin/reservations.pl?page=welcome`);
  check(reservationResp, {
    'status code reservation is 200': (r) => r.status === 200,
    'title is Flight Selections': (r) => r.html('title').text() === 'Flight Selections',
  });
  sleep(Math.random() * 2 + 1);

  // 7. Find Flight
  console.log('7. Поиск рейсов');
  const cityPair = getRandomCityPair();
  const dates = getRandomDates();

  const findFlightResp = http.post(`${BASE_URL}/cgi-bin/reservations.pl`, {
    advanceDiscount: '0',
    depart: cityPair.departCity,
    departDate: dates.departDate,
    arrive: cityPair.arriveCity,
    returnDate: dates.returnDate,
    numPassengers: '1',
    seatPref: 'None',
    seatType: 'Coach',
    'findFlights.x': '26',
    'findFlights.y': '14',
    '.cgifields': ['roundtrip', 'seatType', 'seatPref'],
  });

  // Извлечение списка рейсов
  const flightsList = [];
  const flightRegex = /name="outboundFlight".*?value="([^"]*)"/g;
  let match;
  while ((match = flightRegex.exec(findFlightResp.body)) !== null) {
    flightsList.push(match[1]);
  }

  let outboundFlight = '';
  if (flightsList.length > 0) {
    outboundFlight = flightsList[Math.floor(Math.random() * flightsList.length)];
  }

  check(findFlightResp, {
    'status code find flight is 200': (r) => r.status === 200,
    'title is Flight Selections': (r) => r.html('title').text() === 'Flight Selections',
    'flights found': (r) => flightsList.length > 0,
  });
  sleep(Math.random() * 2 + 1);

  // 8. Select Flight
  console.log('8. Выбор рейса');
  const selectFlightResp = http.post(`${BASE_URL}/cgi-bin/reservations.pl`, {
    outboundFlight: outboundFlight,
    numPassengers: '1',
    advanceDiscount: '0',
    seatType: 'Coach',
    seatPref: 'None',
    'reserveFlights.x': '46',
    'reserveFlights.y': '10',
  });
  check(selectFlightResp, {
    'status code select flight is 200': (r) => r.status === 200,
    'title is Flight Reservation': (r) => r.html('title').text() === 'Flight Reservation',
  });
  sleep(Math.random() * 2 + 1);

  // 9. Buy Ticket
  console.log('9. Покупка билета');
  const buyTicketResp = http.post(`${BASE_URL}/cgi-bin/reservations.pl`, {
    firstName: passenger.firstName || 'John',
    lastName: passenger.lastName || 'Doe',
    address1: '',
    address2: '',
    pass1: passenger.pass1 || 'John Doe',
    creditCard: passenger.creditCard || '1234567890123456',
    expDate: passenger.expDate || '12/25',
    oldCCOption: '1',
    numPassengers: '1',
    seatType: 'Coach',
    seatPref: 'None',
    outboundFlight: outboundFlight,
    advanceDiscount: '0',
    returnFlight: '',
    JSFormSubmit: 'off',
    'buyFlights.x': '27',
    'buyFlights.y': '5',
    '.cgifields': 'saveCC',
  });
  check(buyTicketResp, {
    'status code buy ticket is 200': (r) => r.status === 200,
    'title is Reservation Made!': (r) => r.html('title').text() === 'Reservation Made!',
    'Flight Invoice exists': (r) => {
      const name = (passenger.firstName || 'John') + (passenger.lastName || 'Doe');
      return r.body.includes(`${name}'s Flight Invoice`);
    },
  });
  sleep(Math.random() * 2 + 1);

  // 10. Go Home
  console.log('10. Возврат на домашнюю страницу');
  const goHomeResp = http.get(`${BASE_URL}/cgi-bin/welcome.pl?page=menus`);
  check(goHomeResp, {
    'status code go home is 200': (r) => r.status === 200,
    'title is Web Tours': (r) => r.html('title').text() === 'Web Tours',
  });

  console.log('Тест успешно завершен!');
}
