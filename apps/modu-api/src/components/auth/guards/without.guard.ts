import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * Optional auth. Decodes a token if one is present, sets `null` otherwise, never throws.
 * Public reads that behave differently for logged-in viewers use this
 * (view recording, `meLiked`, `meFollowed`).
 */
@Injectable()
export class WithoutGuard implements CanActivate {
	constructor(private authService: AuthService) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		const bearerToken = request.headers.authorization;

		if (bearerToken) {
			const token = bearerToken.split(' ')[1];
			const authMember = await this.authService.verifyToken(token);
			console.log('memberNick[without] =>', authMember?.memberNick);
			request.body.authMember = authMember;
		} else {
			request.body.authMember = null;
		}
		return true;
	}
}
