# Build dist with the repository's locked toolchain before building this image.
FROM node:22.22.0-alpine
ENV NODE_ENV=production OFFICE_API_HOST=0.0.0.0 OFFICE_API_PORT=4100
WORKDIR /app
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node dist ./dist
USER node
EXPOSE 4100
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:4100/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
