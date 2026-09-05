import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { ReturnReason, ReturnStatus } from '../../enums/return.enum';
import { Member, TotalCounter } from '../member/member';
import { Product } from '../product/product';

@ObjectType()
export class Return {
	@Field(() => String) _id: ObjectId;

	@Field(() => ReturnStatus) returnStatus: ReturnStatus;

	@Field(() => ReturnReason) returnReason: ReturnReason;

	@Field(() => String, { nullable: true }) returnDesc?: string;

	@Field(() => [String], { nullable: true }) returnImages?: string[];

	@Field(() => Int) returnQuantity: number;

	@Field(() => Float) returnAmount: number;

	@Field(() => String) memberId: ObjectId;

	@Field(() => String) sellerId: ObjectId;

	@Field(() => String) orderId: ObjectId;

	@Field(() => String) orderItemId: ObjectId;

	@Field(() => String) productId: ObjectId;

	@Field(() => Date, { nullable: true }) approvedAt?: Date;

	@Field(() => Date, { nullable: true }) rejectedAt?: Date;

	@Field(() => Date, { nullable: true }) completedAt?: Date;

	@Field(() => Date, { nullable: true }) cancelledAt?: Date;

	@Field(() => Date) createdAt: Date;

	@Field(() => Date) updatedAt: Date;

	/** from aggregation **/
	@Field(() => Member, { nullable: true }) memberData?: Member;

	@Field(() => Product, { nullable: true }) productData?: Product;
}

@ObjectType()
export class Returns {
	@Field(() => [Return]) list: Return[];

	@Field(() => [TotalCounter], { nullable: true }) metaCounter: TotalCounter[];
}

/** what the product detail page needs to show or hide the "Return" button */
@ObjectType()
export class ReturnEligibility {
	@Field(() => Boolean) eligible: boolean;

	@Field(() => Int) quantityReturnable: number;

	@Field(() => Date, { nullable: true }) windowClosesAt?: Date;

	@Field(() => String, { nullable: true }) reason?: string;
}
