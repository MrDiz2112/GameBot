FROM node:20-alpine

WORKDIR /app

# Установка зависимостей для сборки
COPY package*.json ./
COPY prisma ./prisma/

# Установка зависимостей
RUN npm install

# Копирование исходного кода
COPY . .

# Генерация Prisma Client
RUN npx prisma generate

# Сборка TypeScript
RUN npm run build

# Очистка dev зависимостей
RUN npm prune --production

# Указываем, что контейнер может принимать соединения на порту 3000
EXPOSE 3000

CMD ["npm", "start"]