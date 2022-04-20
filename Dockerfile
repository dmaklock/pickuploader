FROM node:16-alpine as BUILD_IMAGE
ENV port 3000
ENV NODE_ENV production
WORKDIR /app

COPY package*.json ./
COPY . ./

RUN apk update && apk add python3 \
    && ln -sf python3 /usr/bin/python \
    && npm ci --only=production && npm cache clean --force

FROM node:16-alpine

WORKDIR /app
COPY --from=BUILD_IMAGE /app /app
EXPOSE $port
ENTRYPOINT ["node", "pickuploader.js"]
EXPOSE 3000