FROM node:20.19.0

WORKDIR /app

COPY package*.json /app/

RUN npm install && npx playwright install --with-deps chromium

COPY src /app/src/
COPY tests /app/tests/
COPY playwright.config.js vitest.config.mjs /app/

EXPOSE 3000

CMD ["npm", "start"]