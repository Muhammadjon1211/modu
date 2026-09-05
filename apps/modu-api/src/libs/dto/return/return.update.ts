import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';
import { ObjectId } from 'mongoose';
import { ReturnStatus } from '../../enums/return.enum';

@InputType()
export class ReturnUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsNotEmpty()
	@Field(() => ReturnStatus)
	returnStatus: ReturnStatus;

	/** the seller's note — why it was rejected, or how the refund was issued */
	@IsOptional()
	@Length(3, 2000)
	@Field(() => String, { nullable: true })
	returnDesc?: string;

	/** server-set only */
	approvedAt?: Date;
	rejectedAt?: Date;
	completedAt?: Date;
	cancelledAt?: Date;
}
