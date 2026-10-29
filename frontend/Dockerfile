FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_APP_NAME=ННГАСУ
ENV VITE_APP_NAME=$VITE_APP_NAME
RUN npm run build

FROM nginx:1.27-alpine
ENV BACKEND_PORT=4000 \
    NGINX_CLIENT_MAX_BODY_MB=100
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
