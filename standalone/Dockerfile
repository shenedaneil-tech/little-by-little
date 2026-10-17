FROM node:24-bookworm-slim
WORKDIR /app
COPY planner ./planner
COPY lib/day-plan.mjs ./lib/day-plan.mjs
COPY app/api ./app/api
COPY app/route.ts ./app/route.ts
COPY standalone ./standalone
RUN node standalone/build.mjs
ENV NODE_ENV=production PORT=10000 DB_PATH=/data/planner.sqlite
EXPOSE 10000
CMD ["node", "standalone/start.mjs"]
