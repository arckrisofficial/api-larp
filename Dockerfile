FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY src/widgets/package.json src/widgets/package-lock.json ./src/widgets/
RUN npm ci

COPY . .
RUN npm run ci

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node --from=build /app/dist ./dist
RUN mkdir -p /app/.apiguard && chown -R node:node /app/.apiguard

USER node
EXPOSE 3002
CMD ["npm", "run", "start:prod"]
