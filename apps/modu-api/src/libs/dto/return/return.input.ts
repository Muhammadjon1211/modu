import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
import { ObjectId } from 'mongoose';
import { ReturnReason, ReturnStatus } from '../../enums/return.enum';
import { Direction } from '../../enums/common.enum';
import { availableReturnSorts } from '../../config';

/**
 * The buyer names the line and the quantity and says why.
 * Seller, product, order and the refund amount are all resolved server-side
 * from the order line — a client-supplied refund figure never reaches the DB.
 */
@InputType()
export class ReturnInput {
	@IsNotEmpty()
	@Field(() => String)
	orderItemId: ObjectId;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	returnQuantity: number;

	@IsNotEmpty()
	@Field(() => ReturnReason)
	returnReason: ReturnReason;

	@IsOptional()
	@Length(3, 2000)
	@Field(() => String, { nullable: true })
	returnDesc?: string;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	returnImages?: string[];

	/** server-set, all of them */
	memberId?: ObjectId;
	sellerId?: ObjectId;
	orderId?: ObjectId;
	productId?: ObjectId;
	returnAmount?: number;
}

@InputType()
class RISearch {
	@IsOptional()
	@Field(() => ReturnStatus, { nullable: true })
	returnStatus?: ReturnStatus;
}

@InputType()
export class ReturnsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableReturnSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => RISearch)
	search: RISearch;
}

@InputType()
class ALRISearch {
	@IsOptional()
	@Field(() => ReturnStatus, { nullable: true })
	returnStatus?: ReturnStatus;

	@IsOptional()
	@Field(() => ReturnReason, { nullable: true })
	returnReason?: ReturnReason;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: ObjectId;

	@IsOptional()
	@Field(() => String, { nullable: true })
	sellerId?: ObjectId;
}

@InputType()
export class AllReturnsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableReturnSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => ALRISearch)
	search: ALRISearch;
}
