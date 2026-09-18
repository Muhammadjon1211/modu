import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsNotEmpty, IsOptional, Length, Matches } from 'class-validator';
import { ObjectId } from 'mongoose';

@InputType()
export class AddressUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsOptional()
	@Length(2, 40)
	@Field(() => String, { nullable: true })
	recipientName?: string;

	@IsOptional()
	@Matches(/^[0-9+\-\s()]{7,20}$/)
	@Field(() => String, { nullable: true })
	recipientPhone?: string;

	@IsOptional()
	@Length(3, 200)
	@Field(() => String, { nullable: true })
	addressLine1?: string;

	@IsOptional()
	@Length(0, 200)
	@Field(() => String, { nullable: true })
	addressLine2?: string;

	@IsOptional()
	@Length(2, 60)
	@Field(() => String, { nullable: true })
	city?: string;

	@IsOptional()
	@Length(0, 12)
	@Field(() => String, { nullable: true })
	postalCode?: string;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	isDefault?: boolean;
}
