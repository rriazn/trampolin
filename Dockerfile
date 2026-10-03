FROM node:20.19.0

# browsers outside /root so the unprivileged node user finds them
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
RUN chown node:node /app

COPY --chown=node:node package*.json /app/

USER node
RUN npm install

USER root
RUN npx playwright install --with-deps chromium

# typst compiles the results PDF, xz-utils unpacks its release archive
COPY scripts/install-typst.sh /tmp/install-typst.sh
RUN apt-get update && apt-get install -y --no-install-recommends xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && bash /tmp/install-typst.sh /usr/local/bin \
    && rm /tmp/install-typst.sh

COPY --chown=node:node src /app/src/
COPY --chown=node:node VERSION /app/VERSION

# the app writes its database and sessions below /app/src/data, tests write below /app
USER node

EXPOSE 3000

CMD ["npm", "start"]
