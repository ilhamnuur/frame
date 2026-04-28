FROM node:24-alpine

WORKDIR /app

COPY server.js index.html admin.html config.json ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7075

EXPOSE 7075

CMD ["node", "server.js"]
