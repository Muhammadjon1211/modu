import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsOptional, Length, MaxLength, Min } from 'class-validator';
import { MemberAuthType, MemberStatus, MemberType, socialAuthTypes } from '../../enums/member.enum';
import { Direction } from '../../enums/common.enum';
import { availableMemberSorts, availableSellerSorts } from '../../config';

@InputType()
export class MemberInput {
	@IsNotEmpty()
	@Length(3, 12)
	@Field(() => String)
	memberNick: string;

	@IsNotEmpty()
	@Length(5, 12)
	@Field(() => String)
	memberPassword: string;

	@IsNotEmpty()
	@Field(() => String)
	memberPhone: string;

	@IsOptional()
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@Field(() => MemberAuthType, { nullable: true })
	memberAuthType?: MemberAuthType;
}

@InputType()
export class LoginInput {
	@IsNotEmpty()
	@Length(3, 12)
	@Field(() => String)
	memberNick: string;

	@IsNotEmpty()
	@Length(5, 12)
	@Field(() => String)
	memberPassword: string;
}

/**
 * One mutation for every provider. `credential` is what the provider hands the browser:
 * Google's ID token, Kakao's authorization code, or the Telegram widget's user object as JSON.
 */
@InputType()
export class SocialLoginInput {
	@IsNotEmpty()
	@IsIn(socialAuthTypes)
	@Field(() => MemberAuthType)
	provider: MemberAuthType;

	@IsNotEmpty()
	@MaxLength(4096)
	@Field(() => String)
	credential: string;

	/** Kakao only — must equal the redirect_uri the authorization code was issued for */
	@IsOptional()
	@Field(() => String, { nullable: true })
	redirectUri?: string;

	/** applies only when this login creates the account */
	@IsOptional()
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;
}

@InputType()
class SISearch {
	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

/** the seller directory */
@InputType()
export class SellersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableSellerSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => SISearch)
	search: SISearch;
}

@InputType()
class MISearch {
	@IsOptional()
	@Field(() => MemberStatus, { nullable: true })
	memberStatus?: MemberStatus;

	@IsOptional()
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

/** admin list */
@InputType()
export class MembersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableMemberSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => MISearch)
	search: MISearch;
}

/** `{ page, limit }` only — reused by favorites, visited and order history */
@InputType()
export class OrdinaryInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;
}
