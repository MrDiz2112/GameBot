import dotenv from 'dotenv';
import { GameBot } from './bot/GameBot';
import { GameService } from './services/GameService';
import { SteamParser } from './services/parsers/SteamParser';
import logger from './utils/logger';
import fs from 'fs';
import path from 'path';

// Создаем директорию для логов, если она не существует
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
  logger.error('BOT_TOKEN не найден в переменных окружения');
  process.exit(1);
}

process.on('uncaughtException', error => {
  logger.error('Необработанное исключение:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Необработанная ошибка:', { reason, promise });
});

process.on('SIGTERM', () => {
  logger.info('Получен сигнал SIGTERM, завершаем работу...');
  // Ваш код завершения
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Получен сигнал SIGINT, завершаем работу...');
  // Ваш код завершения
  process.exit(0);
});

const steamParser = new SteamParser();
const gameService = new GameService(steamParser);
const bot = new GameBot(token, gameService);

logger.info('Бот запускается...');
bot.start();
logger.info('Бот успешно запущен!');
