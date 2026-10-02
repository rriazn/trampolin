FROM node:20.19.0

WORKDIR /app

COPY package*.json /app/

RUN npm install && npx playwright install --with-deps chromium

# typst compiles the results PDF, xz-utils unpacks its release archive
COPY scripts/install-typst.sh /tmp/install-typst.sh
RUN apt-get update && apt-get install -y --no-install-recommends xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && bash /tmp/install-typst.sh /usr/local/bin \
    && rm /tmp/install-typst.sh

COPY src /app/src/
COPY VERSION /app/VERSION

EXPOSE 3000

CMD ["npm", "start"]