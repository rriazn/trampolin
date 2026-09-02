FROM node:20.19.0

WORKDIR /app

COPY package*.json /app/

RUN npm install && npx playwright install --with-deps chromium

COPY src /app/src/
COPY VERSION /app/VERSION

EXPOSE 3000

CMD ["npm", "start"]