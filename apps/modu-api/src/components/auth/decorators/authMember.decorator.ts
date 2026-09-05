import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Reads the member the guard placed on `request.body.authMember`.
 * `@AuthMember('_id')` yields one claim; `@AuthMember()` yields the whole payload.
 */
export const AuthMember = createParamDecorator((data: string, context: ExecutionContext | any) => {
	let request: any;
	if (context.contextType === 'graphql') {
		request = context.getArgByIndex(2).req;
		if (request.body.authMember) {
			request.body.authMember.authorization = request.headers?.authorization;
		}
	} else request = context.switchToHttp().getRequest();

	const member = request.body.authMember;
	if (member) return data ? member?.[data] : member;
	else return null;
});
