import { Field, ObjectType } from '@nestjs/graphql';

/**
 * The public half of each provider's setup — what the browser needs to draw a button.
 * A provider whose keys are not configured comes back null and its button is hidden.
 */
@ObjectType()
export class AuthProviders {
	@Field(() => String, { nullable: true }) googleClientId?: string;

	@Field(() => String, { nullable: true }) kakaoClientId?: string;

	@Field(() => String, { nullable: true }) telegramBotId?: string;
}

/** who the provider says the person is — only ever built after server-side verification */
export interface SocialIdentity {
	socialId: string;
	name?: string;
	/** a handle to base the Modu nickname on, when the provider has one (Telegram username) */
	nick?: string;
	image?: string;
}
