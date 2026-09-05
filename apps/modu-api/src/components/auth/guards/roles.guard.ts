import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { Message } from '../../../libs/enums/common.enum';

/** Everything AuthGuard does, plus a role check. Always paired with `@Roles(...)`. */
@Injectable()
export class RolesGuard implements CanActivate {
	constructor(
		private reflector: Reflector,
		private authService: AuthService,
	) {}

	public async canActivate(context: ExecutionContext | any): Promise<boolean> {
		const roles = this.reflector.get<string[]>('roles', context.getHandler());
		if (!roles) return true;

		if (context.contextType !== 'graphql') return false;

		const request = context.getArgByIndex(2).req;
		const bearerToken = request.headers.authorization;
		if (!bearerToken) throw new UnauthorizedException(Message.TOKEN_NOT_EXIST);

		const token = bearerToken.split(' ')[1];
		const authMember = await this.authService.verifyToken(token);
		if (!authMember) throw new UnauthorizedException(Message.NOT_AUTHENTICATED);

		const hasRole = () => roles.indexOf(authMember.memberType) > -1;
		const hasPermission: boolean = hasRole();
		if (!hasPermission) throw new ForbiddenException(Message.ONLY_SPECIFIC_ROLES_ALLOWED);

		console.log('memberNick[roles] =>', authMember.memberNick);
		request.body.authMember = authMember;
		return true;
	}
}
