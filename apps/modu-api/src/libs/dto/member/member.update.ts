import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';
import { ObjectId } from 'mongoose';
import { MemberStatus, MemberType } from '../../enums/member.enum';

@InputType()
export class MemberUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsOptional()
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@Field(() => MemberStatus, { nullable: true })
	memberStatus?: MemberStatus;

	@IsOptional()
	@Length(3, 12)
	@Field(() => String, { nullable: true })
	memberNick?: string;

	@IsOptional()
	@Length(5, 12)
	@Field(() => String, { nullable: true })
	memberPassword?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberPhone?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberFullName?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberImage?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberAddress?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberDesc?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberShopName?: string;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberShopBanner?: string;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	memberSocials?: string[];

	deletedAt?: Date; // server-set only
}

/** a member changing their own sign-in — the current password proves it is really them */
@InputType()
export class CredentialsUpdate {
	@IsNotEmpty()
	@Length(5, 12)
	@Field(() => String)
	currentPassword: string;

	@IsOptional()
	@Length(3, 12)
	@Field(() => String, { nullable: true })
	memberNick?: string;

	@IsOptional()
	@Length(5, 12)
	@Field(() => String, { nullable: true })
	newPassword?: string;
}
