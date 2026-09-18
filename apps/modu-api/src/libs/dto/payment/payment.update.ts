import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsNotEmpty, IsOptional, Length } from 'class-validator';
import { ObjectId } from 'mongoose';

/** only the label and the default flag change; a new card is a new method */
@InputType()
export class PaymentMethodUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsOptional()
	@Length(2, 60)
	@Field(() => String, { nullable: true })
	holderName?: string;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	isDefault?: boolean;
}
