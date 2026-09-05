import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logs the request body, then the response with elapsed milliseconds — each truncated
 * so the terminal stays readable. Errors are not handled here; they are formatted
 * globally by `formatError` in AppModule.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger: Logger = new Logger();

	public intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const recordTime = Date.now();
		const requestType = context.getType<GqlContextType>();

		if (requestType === 'http') {
			// develop if needed
		} else if (requestType === 'graphql') {
			const gqlContext = GqlExecutionContext.create(context);
			this.logger.log(`${this.stringify(gqlContext.getContext().req.body)}`, 'REQUEST');

			return next.handle().pipe(
				tap((response) => {
					const responseTime = Date.now() - recordTime;
					this.logger.log(`${this.stringify(response)}-${responseTime}ms \n\n`, 'RESPONSE');
				}),
			);
		}
		return next.handle();
	}

	private stringify(context: any): string {
		return JSON.stringify(context).slice(0, 75);
	}
}
