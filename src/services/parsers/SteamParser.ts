import axios from 'axios';
import * as cheerio from 'cheerio';
import { IParser, IGame, GamePrice } from '../../types';

export class SteamParser implements IParser {
  private async fetchPage(url: string): Promise<cheerio.CheerioAPI> {
    const { data } = await axios.get(url);
    return cheerio.load(data);
  }

  async parseGame(url: string): Promise<IGame> {
    const $ = await this.fetchPage(url);

    const title = $('.apphub_AppName').first().text().trim();
    const price = this.processPrices($);

    const tags = $('.app_tag')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(tag => tag !== '');

    return {
      title,
      url,
      basePrice: price.basePrice,
      currentPrice: price.discount ?? price.basePrice,
      platform: 'steam',
      tags,
      lastChecked: new Date(),
      players: 1,
    };
  }

  async parsePrice(url: string): Promise<GamePrice> {
    const $ = await this.fetchPage(url);
    return this.processPrices($);
  }

  private processPrices($: cheerio.CheerioAPI): GamePrice {
    const discountContainer = $('.discount_prices');

    if (discountContainer.length > 0) {
      const originalPrice = discountContainer
        .find('.discount_original_price')
        .first()
        .text()
        .trim();
      const discountPrice = discountContainer.find('.discount_final_price').first().text().trim();

      const originalPriceNum = this.priceStringToNumber(originalPrice);
      const discountPriceNum = this.priceStringToNumber(discountPrice);

      return {
        basePrice: originalPriceNum,
        discount: discountPriceNum,
      };
    } else {
      const priceString = $('.game_purchase_price').first().text().trim();
      return {
        basePrice: this.priceStringToNumber(priceString),
      };
    }
  }

  private priceStringToNumber(priceString: string): number {
    return parseFloat(priceString.replace(/[^0-9.,]/g, '').replace(',', '.'));
  }
}
