# 前端静态资源镜像：多阶段构建，nginx 提供静态文件并把 /api 反代到后端。

# --- 构建阶段 ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- 运行阶段 ---
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
ENV ERP_PYTHON_UPSTREAM=http://host.docker.internal:8848 \
    ERP_JAVA_UPSTREAM=http://host.docker.internal:8080 \
    NGINX_ENVSUBST_FILTER=^ERP_
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
