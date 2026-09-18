import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsNotEmpty, IsOptional, Length, Matches } from 'class-validator';
import { ObjectId } from 'mongoose';

@InputType()
export class AddressInput {
	@IsNotEmpty()
	@Length(2, 40)
	@Field(() => String)
	recipientName: string;

	@IsNotEmpty()
	@Matches(/^[0-9+\-\s()]{7,20}$/)
	@Field(() => String)
	recipientPhone: string;

	@IsNotEmpty()
	@Length(3, 200)
	@Field(() => String)
	addressLine1: string;

	@IsOptional()
	@Length(0, 200)
	@Field(() => String, { nullable: true })
	addressLine2?: string;

	@IsNotEmpty()
	@Length(2, 60)
	@Field(() => String)
	city: string;

	@IsOptional()
	@Length(0, 12)
	@Field(() => String, { nullable: true })
	postalCode?: string;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	isDefault?: boolean;

	/** assigned in the resolver from @AuthMember('_id') */
	memberId?: ObjectId;
}
