import { Controller, Get, Logger } from '@nestjs/common';
import { Cron, Timeout } from '@nestjs/schedule';
import { BatchService } from './batch.service';
import { BATCH_ROLLBACK, BATCH_TOP_PRODUCTS, BATCH_TOP_SELLERS } from './lib/config';

/**
 * Scheduling and logging only — never logic. The crons are staggered by 20 seconds
 * so the rollback always finishes before the ranking jobs read the zeroed ranks.
 */
@Controller()
export class BatchController {
	private logger: Logger = new Logger('BatchController');

	constructor(private readonly batchService: BatchService) {}

	@Timeout(1000)
	public handleTimeout() {
		this.logger.debug('BATCH SERVER READY!');
	}

	@Cron('00 00 01 * * *', { name: BATCH_ROLLBACK })
	public async batchRollback() {
		try {
			this.logger['context'] = BATCH_ROLLBACK;
			this.logger.debug('EXECUTED');
			await this.batchService.batchRollback();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Cron('20 00 01 * * *', { name: BATCH_TOP_PRODUCTS })
	public async batchTopProducts() {
		try {
			this.logger['context'] = BATCH_TOP_PRODUCTS;
			this.logger.debug('EXECUTED');
			await this.batchService.batchTopProducts();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Cron('40 00 01 * * *', { name: BATCH_TOP_SELLERS })
	public async batchTopSellers() {
		try {
			this.logger['context'] = BATCH_TOP_SELLERS;
			this.logger.debug('EXECUTED');
			await this.batchService.batchTopSellers();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Get()
	public getHello(): string {
		return this.batchService.getHello();
	}
}
